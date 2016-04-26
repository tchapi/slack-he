var express = require('express')
var bodyParser = require('body-parser')
var nunjucks = require('nunjucks')
var Slack = require('node-slack')

var app = express()

// Add config module
var CONFIG = require('./services/ConfigParser')
var config = new CONFIG()

// Add SQLite Wrapper
var SQLiteWrapper = require('./services/SQLiteWrapper')
var db = new SQLiteWrapper(config.get("db"))

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

// static files
app.use('/static', express.static(__dirname + '/public'))

// templating 
nunjucks.configure('views', {
    autoescape: false,
    express: app
})

// And finally Slack config
var slack = new Slack(config.get('slack').domain,config.get('slack').api_token)

// This is the admin / dashboard interface endpoint
app.get('/',function(req,res) {

    if (req.query.token != config.get('slack').payload_token) {

        console.log("Bad token :", req.query.token)
        res.status(403).end()

    } else {

        // TODO
        //res.render('dashboard.html')
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

    } else if (req.body.text.substr(0,config.get('slack').command_command.length) == config.get('slack').command_command) { // We don't want to store commands

        res.status(204).end() // No-Content

    } else {

        // Store message, and that's all
        db.insertMessage(req.body.user_name, Math.floor(req.body.ttimestamp), req.body.text, req.body.channel_name)
        res.status(200).end() // OK

    }
})

/* That is the command endpoint
*/
app.post(config.get('slack').command_command,function(req,res) {

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

    if (req.body.token != config.get('slack').command_token) {

        console.log("Bad token :", req.body.token)
        res.status(403).end()

    } else if (req.body.user_id == 'USLACKBOT') { // Typical, for a bot.

        res.status(204).end() // No-Content

    } else if (req.body.command == config.get('slack').command_command){

        var args = req.body.text
        var channel = req.body.channel_name
        var poster = req.body.user_name

        // We need to output stats ;)

        /* TODO TODO TODO TODO TODO */

        res.status(200).end() // OK
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
