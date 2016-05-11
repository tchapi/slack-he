var express = require('express')
var bodyParser = require('body-parser')
var nunjucks = require('nunjucks')
var nunjucksDate = require('nunjucks-date');

var request = require('request')

var md = require('markdown-it')({
  html: true,
  linkify: true,
  typographer: true
});

var app = express()

// Add string helper module
var StringHelper = require('./services/StringHelper')
var _str = new StringHelper()

// Add config module
var CONFIG = require('./services/ConfigParser')
var config = new CONFIG()

// Add SQLite Wrapper
var SQLiteWrapper = require('./services/SQLiteWrapper')
var db = new SQLiteWrapper({"db": config.get("db"), "stopwords": config.get("stopwords")})

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// static files
app.use('/static', express.static(__dirname + '/public'))

// templating 
var env = nunjucks.configure('views', {
    autoescape: false,
    express: app
})
nunjucksDate.setDefaultFormat('MMMM Do YYYY, HH:mm:ss');
nunjucksDate.install(env);

// Let's get the users so we can store / update their avatars
var avatars = [];
var avatars_id = [];
var team_url = "https://" + config.get('slack').domain + ".slack.com/team/";
var users_url = "https://slack.com/api/users.list?token=" + config.get('slack').api_token

request(users_url, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    const users_list = JSON.parse(body);
    for (var user in users_list.members) {
      avatars[users_list.members[user].name] = users_list.members[user].profile.image_48;
      avatars_id[users_list.members[user].id] = users_list.members[user].name;
    }
  } else {
    console.log("Got an error: ", error, ", status code: ", response.statusCode);
  }
});

var channels_id = [];
var channel_url = "https://" + config.get('slack').domain + ".slack.com/messages/";
var channels_url = "https://slack.com/api/channels.list?token=" + config.get('slack').api_token

request(channels_url, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    const channels_list = JSON.parse(body);
    for (var channel in channels_list.channels) {
      channels_id[channels_list.channels[channel].id] = channels_list.channels[channel].name;
    }
  } else {
    console.log("Got an error: ", error, ", status code: ", response.statusCode);
  }
});

// This is the search results endpoint
app.get('/search/:channel/:terms',function(req,res) {

    if (req.query.token != config.get('slack').pages_token) {

        console.log("Bad token :", req.query.token)
        res.status(403).end()

    } else {

        // Search
        db.search(req.params.terms, req.params.channel, null, function(results) {

          var words_array = req.params.terms.split(' ');
          for (var i = 0; i < results.length; i++) {
            results[i].message = _str.highlight(results[i].message, words_array)
          }
          res.render('search.html', { "channel": req.params.channel, "terms": req.params.terms, avatars: avatars, "results": results })
        })
    }

})

// This is the full history endpoint
app.get('/:channel/:from?/:to?',function(req,res) {

    if (req.query.token != config.get('slack').pages_token) {

        console.log("Bad token :", req.query.token)
        res.status(403).end()

    } else {

        // All messages, check dates 

        var to_date = Date.parse(req.params.to);
        if (isNaN(to_date) || to_date > Date.now()) {
          to_date = Date.now() + 1 * 1000  // a bit ahead
        }
        var from_date = Date.parse(req.params.from);
        if (isNaN(from_date)) {
          to_date = Date.now()
          from_date = Date.now() - 60 * 60 * 24 * 1000; // one day by default
        }

        //console.log("history (" +  new Date().toLocaleString() + ") from " + from_date + "(" +  new Date(from_date).toLocaleString() + ")" + " to " + to_date + "(" +  new Date(to_date).toLocaleString() + ")")

        db.getMessages(req.params.channel, from_date, to_date, function(messages) {
          res.render('history.html', { "channel": req.params.channel, "token": req.query.token, "messages": messages, avatars: avatars, "start_date": from_date, "end_date": to_date })
        })
    }

})

/* That is the endpoint Slack posts to 
   for all incoming messages
*/
app.post('/',function(req,res) {

    /*

      token=TEST
      team_id=T0001
      team_domain=example
      channel_id=C2147483705
      channel_name=test
      timestamp=1355517523.000005
      user_id=U2147483697
      user_name=Steve
      text=googlebot: What is the air-speed velocity of an unladen swallow?
      trigger_word=googlebot:

    */

    if (req.body.token != config.get('slack').payload_token) {

        console.log("Bad token :", req.body.token)
        res.status(403).end()

    } else if (req.body.user_id == 'USLACKBOT') { // Typical, for a bot.

        res.status(204).end() // No-Content

    } else if (req.body.text.substr(0,config.get('slack').command_search_command.length) == config.get('slack').command_search_command &&
               req.body.text.substr(0,config.get('slack').command_stats_command.length) == config.get('slack').command_stats_command ) { // We don't want to store commands

        res.status(204).end() // No-Content

    } else {

        // Change <@ID> to something relevant
        var messageHTML = req.body.text.replace(/<@[^>]*>/g, function users_to_name(x){
          x = x.replace("<@", "").replace(">", "")
          return "<a target='_blank' href='" + team_url + avatars_id[x] + "'>@" + avatars_id[x] + "</a>";
        });

        // Change <#C178PKDCY> to something relevant
        messageHTML = messageHTML.replace(/<#[^>]*>/g, function channels_to_name(x){
          x = x.replace("<#", "").replace(">", "")
          return "<a target='_blank' href='" + channel_url + channels_id[x] + "'>#" + channels_id[x] + "</a>";
        });

        // Change <links> to something relevant
        messageHTML = messageHTML.replace(/<http[^>]*>/g, function urls_to_urls(x){
          x = x.replace("<", "").replace(">", "")
          return "<a target='_blank' href='" + x + "'>" + x + "</a>";
        });

        // And then markdown
        messageHTML = md.render(messageHTML);

        // Store message, and that's all
        db.insertMessage(req.body.user_name, Date.now(), messageHTML, req.body.text, req.body.channel_name)
        res.status(200).end() // OK

    }
})

/* That is the command endpoint
*/
app.post(config.get('slack').command_endpoint,function(req,res) {

    /*

      token=TEST
      team_id=T0001
      team_domain=example
      channel_id=C2147483705
      channel_name=test
      user_id=U2147483697
      user_name=Steve
      command=/weather
      text=94070
      response_url=https://hooks.slack.com/commands/1234/5678

    */

    if (req.body.token != config.get('slack').command_stats_token && req.body.token != config.get('slack').command_search_token) {

        console.log("Bad token :", req.body.token)
        res.status(403).end()

    } else if (req.body.user_id == 'USLACKBOT') { // Typical, for a bot.

        res.status(204).end() // No-Content

    } else if (req.body.command == config.get('slack').command_search_command){

        var search_text = req.body.text
        var channel = req.body.channel_name

        // If no search term is provided, we just output the url of the history page
        if (search_text == "") {
          var history_url = config.get('host') + "/" + channel + "?token=" + config.get('slack').pages_token
          res.json({ "text": "You can find the whole channel history <" + history_url + "|here>."}).end()
          return;
        }

        // We need to search
        db.search(search_text, channel, null, function(results) {

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

          if (results.length == 0) {
            res.json({ "text": "Woops, no results for '" + search_text + "'"}).end()
            return;
          }

          var max_results = config.get('slack').search.limit
          var color = config.get('slack').search.color
          
          var words_array = search_text.split(' ');
          var url = config.get('host') + "/search/" + channel + "/" + encodeURIComponent(search_text) + "?token=" + config.get('slack').pages_token
          var response = { "text": "🔎 Top " + Math.min(results.length, max_results) + " results for '" + search_text + "'" + (max_results<results.length?" (<"+ url +"|see all>)":"") + " :", "attachments": [] }

          for (var i = 0; i < Math.min(results.length, max_results); i++) {

            var h_text = _str.code(results[i].message, words_array)

            response["attachments"].push({
                      "fallback": results[i].poster + " : " + h_text,
                      "color": color,
                      "author_name": results[i].poster + " @ " + new Date(results[i].timestamp).toLocaleString(),
                      "text": h_text,
                      "mrkdwn_in": ["text", "author_name"]
                  });
          }

          res.json(response).end() // OK
        })

    } else if (req.body.command == config.get('slack').command_stats_command){

        var channel = req.body.channel_name

        // We need to output stats ;)
        db.stat(channel, function(results) {

          var text = "```| User              | Most common word                  | Messages total     |\n";
             text += "------------------------------------------------------------------------------\n";

          for (var p in results) {
            text += "| " + _str.pad(' ', 18, p) + " | " + _str.pad(' ', 34, results[p].word + " (" + results[p].word_count + " occurences)") + " | " + _str.pad(' ', 19, results[p].total + " (" + parseInt(results[p].average) + "/d.avg)") + " |\n";
          }
          
          text += "------------------------------------------------------------------------------```";

          res.json({ "text": text}).end() // OK
        
        })

    } else {

        console.log("Bad command :", req.body.command)
        res.status(404).end()
    }
})


// Start application
var server = app.listen(config.get("port"), function () {

  var host = server.address().address
  var port = server.address().port

  console.log("\n ** Slack History Extended (HE) **")
  console.log(" A bot that stores all messages and")
  console.log(" enables full deep search via in-app")
  console.log(" commands.\n")

  console.log('Starting Slack HE for domain %s.slack.com at http://%s:%s', config.get("slack").domain, host, port)

})
