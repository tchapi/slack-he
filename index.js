const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const nunjucks = require('nunjucks');
const nunjucksDate = require('nunjucks-date');
const fetch = require('node-fetch');
const { App, ExpressReceiver } = require('@slack/bolt');
const dotenv = require('dotenv');
const md = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true,
});
const CONFIG = require('./services/ConfigParser');
const StringHelper = require('./services/StringHelper');
const SQLiteWrapper = require('./services/SQLiteWrapper');

dotenv.config();

if (!process.env.SLACK_BOT_TOKEN
    || !process.env.SLACK_SIGNING_SECRET
    || !process.env.ACCESS_TOKEN) {
  console.error('Error: You must provide a SLACK_BOT_TOKEN, a SLACK_SIGNING_SECRET and an ACCESS_TOKEN in your .env file.');
  process.exit(1);
}

console.log('🛠  Config read from .env file');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

receiver.app.use(bodyParser.urlencoded({ extended: false }));
receiver.app.use(bodyParser.json());

// static files
receiver.app.use('/static', serveStatic(`${__dirname}/public`));

// templating
const nunjucksEnv = nunjucks.configure('views', {
  autoescape: false,
  express: receiver.app,
});
nunjucksDate.setDefaultFormat('MMMM Do YYYY, HH:mm:ss');
nunjucksDate.install(nunjucksEnv);

// Add string helper module
const strHelper = new StringHelper();

// Add config module
const config = new CONFIG();

// Add SQLite Wrapper
const db = new SQLiteWrapper({ db: config.get('db'), stopwords: config.get('stopwords') });

// Let's get the users so we can store / update their avatars
const avatars = [];
const avatarsId = [];

const teamUrl = `https://${process.env.SLACK_DOMAIN}.slack.com/team/`;
const usersUrl = `https://slack.com/api/users.list?token=${config.get('slack').api_token}`;
const getUsers = async () => {
  try {
    const response = await fetch(usersUrl);
    const usersList = await response.json();
    /// if ok: false throw "error"
    for (const user in usersList.members) {
      avatars[usersList.members[user].name] = usersList.members[user].profile.image_48;
      avatarsId[usersList.members[user].id] = usersList.members[user].name;
    }
  } catch (error) {
    console.log(error);
  }
};

// Idem for channels
const channelsId = [];

const channelUrl = `https://${process.env.SLACK_DOMAIN}.slack.com/messages/`;
const channelsUrl = `https://slack.com/api/channels.list?token=${config.get('slack').api_token}`;
const getChannels = async () => {
  try {
    const response = await fetch(channelsUrl);
    const channelsList = await response.json();

    for (const channel in channelsList.channels) {
      channelsId[channelsList.channels[channel].id] = channelsList.channels[channel].name;
    }
  } catch (error) {
    console.log(error);
  }
};

// This is the search results endpoint
receiver.app.get('/search/:channel/:terms', (req, res) => {
  if (req.query.token !== process.env.PAGES_TOKEN) {
    console.log('Bad token :', req.query.token);
    res.status(403).end();
  } else {
    // Search
    db.search(req.params.terms, req.params.channel, null, true, (results) => {
      const wordsArray = req.params.terms.split(' ');
      const highlightedResults = [];
      for (let i = 0; i < results.length; i += 1) {
        highlightedResults[i] = results[i];
        highlightedResults[i].message = strHelper.highlight(results[i].message, wordsArray);
      }
      res.render('search.html', {
        channel: req.params.channel, terms: req.params.terms, avatars, highlightedResults,
      });
    });
  }
});

// This is the full history endpoint
receiver.app.get('/:channel/:from?/:to?', (req, res) => {
  if (req.query.token !== process.env.PAGES_TOKEN) {
    console.log('Bad token :', req.query.token);
    res.status(403).end();
  } else {
    // All messages, check dates

    let toDate = Date.parse(req.params.to);
    if (Number.isNaN(toDate) || toDate > Date.now()) {
      toDate = Date.now() + 1 * 1000; // a bit ahead
    }
    let fromDate = Date.parse(req.params.from);
    if (Number.isNaN(fromDate)) {
      toDate = Date.now();
      fromDate = Date.now() - 60 * 60 * 24 * 1000; // one day by default
    }

    db.getMessages(req.params.channel, fromDate, toDate, (messages) => {
      res.render('history.html', {
        channel: req.params.channel,
        token: req.query.token,
        messages,
        avatars,
        start_date: fromDate,
        end_date: toDate,
      });
    });
  }
});

app.message(async ({ message }) => {
  const poster = message.user;

  if (poster === 'USLACKBOT') { // Typical, for a bot.
    return;
  }

  // Change <@ID> to something relevant
  let messageHTML = message.text.replace(/<@[^>]*>/g, (x) => {
    const i = x.replace('<@', '').replace('>', '');
    return `<a target='_blank' href='${teamUrl}${avatarsId[i]}'>@${avatarsId[i]}</a>`;
  });

  // Change <#C178PKDCY> to something relevant
  messageHTML = messageHTML.replace(/<#[^>]*>/g, (x) => {
    const i = x.replace('<#', '').replace('>', '');
    return `<a target='_blank' href='${channelUrl}${channelsId[i]}'>#${channelsId[i]}</a>`;
  });

  // Change <links> to something relevant
  messageHTML = messageHTML.replace(/<http[^>]*>/g, (x) => {
    const link = x.replace('<', '').replace('>', '');
    return `<a target='_blank' href='${link}'>${link}</a>`;
  });

  // And then markdown
  messageHTML = md.render(messageHTML);

  // Store message, and that's all
  db.insertMessage(poster, Date.now(), messageHTML, message.text, message.channel_name);
});

app.command(config.get('slack').command_search_command, async ({ command, ack, respond }) => {
  await ack();

  const searchText = command.text;
  const channel = command.channel_name;

  // If no search term is provided, we just output the url of the history page
  if (searchText === '') {
    const historyUrl = `${config.get('host')}/${channel}?token=${process.env.PAGES_TOKEN}`;

    await respond(`You can find the whole channel history <${historyUrl}|here>.`);
    return;
  }

  // We need to search
  db.search(searchText, channel, null, false, async (results) => {
    // We format the results
    /*
        {
          "text": "🔎 Your search results for 'test' :",
          "attachments": [
              {
                  "fallback": "Required plain-text summary of the attachment.",
                  "color": "#36a64f",
                  "author_name": "Bobby Tables @ 24 jan. 2016 20:35",
                  "author_icon": "http://image.url/",
                  "text": "Optional text that appears within the attachment"
              }
            ]
        }
      */

    if (results.length === 0) {
      await respond(`Woops, no results for '${searchText}'`);
      return;
    }

    const maxResults = config.get('slack').search.limit;
    const { color } = config.get('slack').search;

    const wordsArray = searchText.split(' ');
    const url = `${config.get('host')}/search/${channel}/${encodeURIComponent(searchText)}?token=${config.get('slack').pages_token}`;
    const response = { text: `🔎 Top ${Math.min(results.length, maxResults)} results for '${searchText}'${maxResults < results.length ? ` (<${url}|see all>)` : ` (<${url}|see in the browser>)`} :`, attachments: [] };

    for (let i = 0; i < Math.min(results.length, maxResults); i += 1) {
      const hText = strHelper.code(results[i].message, wordsArray);

      response.attachments.push({
        fallback: `${results[i].poster} : ${hText}`,
        color,
        author_name: `${results[i].poster} @ ${new Date(results[i].timestamp).toLocaleString()}`,
        text: hText,
        mrkdwn_in: ['text'],
      });
    }

    await respond(response);
  });
});

app.command(config.get('slack').command_stats_command, async ({ command, ack, respond }) => {
  await ack();

  const channel = command.channel_name; // ????

  // We need to output stats ;)
  db.stat(channel, async (results) => {
    let text = `Word stats since *${new Date(results.special_timestamp).toLocaleString()}* :`;

    text += '```| User              | Most common word                  | Messages total     |\n';
    text += '------------------------------------------------------------------------------\n';

    for (const p in results) {
      if (p === 'special_timestamp') { continue; }
      text += `| ${strHelper.pad(' ', 18, p)} | ${strHelper.pad(' ', 34, `${results[p].word} (${results[p].word_count} occurences)`)} | ${strHelper.pad(' ', 19, `${results[p].total} (${parseInt(results[p].average)}/d.avg)`)} |\n`;
    }

    text += '------------------------------------------------------------------------------```';

    await respond(text);
  });
});

// Start application
(async () => {
  const port = process.env.PORT || 4000;
  await app.start(port);

  console.log(`⚡️ Starting Slack HE for domain ${process.env.SLACK_DOMAIN}.slack.com at http://${config.get('host')}:${port}`);
  console.log('\n ** Slack History Extended (HE) **');
  console.log(' A bot that stores all messages and');
  console.log(' enables full deep search via in-app');
  console.log(' commands.\n');

  console.log('👥 Retrieving users ...');
  await getUsers();

  console.log('📡 Retrieving channels ...');
  await getChannels();
})();
