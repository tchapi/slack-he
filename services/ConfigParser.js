var fs = require('fs')

ConfigParser = function(options) {

  if (options && options.filename != "") {
    this.filename = options.filename
  } else {
    this.filename = "config.json"
  }

  try {

    // Read config file
    this.data = fs.readFileSync(this.filename)
    this.config = JSON.parse(this.data)

  } catch (err) {
    
    throw err

  }

}

var p = ConfigParser.prototype

p.get = function(key) {
  return this.config[key]
}

p.getConfig = function() {
  return this.config
}

p.getJsonString = function() {
  return this.data
}

p.writeJsonObject = function(jsonObject) {
  this.config = jsonObject
  this.data = JSON.stringify(this.config)
  try {
    fs.writeFileSync(this.filename, this.data)
  } catch(err) {
    
  }
}

module.exports = ConfigParser
