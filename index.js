var express = require('express')
var bodyParser = require('body-parser')
var nunjucks = require('nunjucks')
var Slack = require('node-slack')

var app = express()

// Add config module
var CONFIG = require('./services/ConfigParser')
var config = new CONFIG()

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
var slack = new Slack(config.get('domain'),config.get('api_token'))

// This is the admin / dashboard interface endpoint
app.get('/',function(req,res) {

    if (req.query.token != config.get('payload_token')) {

        console.log("Bad token :", req.query.token)
        //res.render('unauthorized.html')

    } else {

        // TODO
        //res.render('dashboard.html')
    }

})

// That is the endpoint Slack posts to
app.post('/',function(req,res) {

    if (req.body.token != config.get('payload_token')) {

        console.log("Bad token :", req.body.token)
        res.status(403).end()

    } else if (req.body.user_id == 'USLACKBOT') { // Typical, for a bot.

        res.status(204).end() // No-Content

    } else {

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

  console.log('Starting Slack HE for domain %s.slack.com at http://%s:%s', config.get("domain"), host, port)

})
