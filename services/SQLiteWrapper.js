var sqlite3 = require('sqlite3').verbose();

SQLiteWrapper = function(options) {

  // Refs DB
  this.db = new sqlite3.Database(options.path, sqlite3.OPEN_READWRITE);

}

var p = SQLiteWrapper.prototype

p.insertMessage = function(poster, timestamp, message, channel) {

  var stmt = this.db.prepare("INSERT INTO data (message, poster, timestamp, channel) VALUES ($message, $poster, $timestamp, $channel)");

  stmt.run({
        $message: message,
        $poster: poster,
        $timestamp: timestamp,
        $channel: channel
    }, (function(err) {

        var docid = stmt.lastID;
        var stmtFTS = this.db.prepare("INSERT INTO dataFTS (docid, message, poster) VALUES ($docid, $message, $poster)");

        stmtFTS.run({
              $docid: docid,
              $message: message,
              $poster: poster,
          });

        stmtFTS.finalize();

    }).bind(this)
  );

}

p.search = function(text, poster) {

  var sql = "SELECT * FROM dataFTS WHERE message MATCH $search";
  var params = { $search: text };

  if (poster != null) {
    sql += " AND poster = ?";
    params = { $search: text, $poster: poster };
  }

  this.db.serialize((function() {

    this.db.each(sql, params, function(err, row) {
        console.log(row.id + ": " + row.info);
    });

  }).bind(this));

}

module.exports = SQLiteWrapper
