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

        /// For FTS4
        var docid = stmt.lastID;
        var stmtFTS = this.db.prepare("INSERT INTO dataFTS (docid, message, poster) VALUES ($docid, $message, $poster)");

        stmtFTS.run({
              $docid: docid,
              $message: message,
              $poster: poster,
          });

        stmtFTS.finalize();

        // For stats per word
        this.db.serialize((function() {

            this.db.exec("BEGIN");

            var words = message.split(' ')

            // TODO : remove common words from list

            for (var i = 0; i < words.length; i++) {
              var stmtStats = this.db.prepare("INSERT INTO stats (word, poster, channel) VALUES ($word, $poster, $channel)");

              stmtStats.run({
                    $word: words[i],
                    $poster: poster,
                    $channel: channel
                });
            }

            this.db.exec("COMMIT");

        }).bind(this));

    }).bind(this)
  );

}

p.search = function(text, channel, poster, callback) {

  var sql = "SELECT docid, * FROM dataFTS WHERE message MATCH $search AND channel = $channel";
  var params = { $search: text, $channel: channel };

  if (poster != null) {
    sql += " AND poster = ?";
    params = { $search: text, $channel: channel, $poster: poster };
  }

  this.db.serialize((function() {

    var results = []; 
    this.db.each(sql, params, function(err, row) {
        results.push({ "docid" : row.docid, "message": row.message, "poster": row.poster, "timestamp": row.timestamp });
    }, function(err, nb) {
      callback(results)
    });

  }).bind(this));

}

p.stat = function(args, channel, callback) {

  var sql_total = "SELECT poster, AVG(msg_count) AS average, SUM(msg_count) AS total FROM (SELECT poster, timestamp, COUNT(*) AS msg_count FROM data WHERE channel = $channel GROUP BY timestamp/(1000*60*60*24), poster) a GROUP BY poster;"
  var sql_words = "SELECT * FROM (SELECT poster, word, COUNT(word) AS word_count FROM stats WHERE channel = $channel GROUP BY poster, word) a GROUP BY a.poster HAVING a.word_count = MAX(a.word_count);";
  var params = { $channel: channel };

  this.db.serialize((function() {

    var results = []; 

    this.db.each(sql_words, params, function(err, row) {
        if (row) {
          results[row.poster]= { "word" : row.word, "word_count": row.word_count, "total": 0, "average": 0 };
        }
    }, (function(err, nb) {
      this.db.each(sql_total, params, function(err, row) {
          if (row) {
            results[row.poster].total = row.total;
            results[row.poster].average = row.average;
          }
      }, function(err, nb) {
        callback(results)
      });
    }).bind(this));

  }).bind(this));
}

module.exports = SQLiteWrapper
