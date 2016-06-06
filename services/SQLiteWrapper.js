var sqlite3 = require('sqlite3').verbose();

SQLiteWrapper = function(options) {

  // Refs DB
  this.db = new sqlite3.Database(options.db.path, sqlite3.OPEN_READWRITE);

  // Stopwords
  var words_list = options.stopwords.join("|");
  this.stopwords_regex = new RegExp("(?:^|\\s)(" + words_list + ")(?=\\s+|$)", "gi");

}

var p = SQLiteWrapper.prototype

p.insertMessage = function(poster, timestamp, messageHTML, message, channel) {

  var stmt = this.db.prepare("INSERT INTO data (message, message_raw, poster, timestamp, channel) VALUES ($message, $message_raw, $poster, $timestamp, $channel);");

  stmt.run({
        $message: messageHTML,
        $message_raw: message,
        $poster: poster,
        $timestamp: timestamp,
        $channel: channel
    }, (function(err) {

        /// For FTS4
        var docid = stmt.lastID;
        var stmtFTS = this.db.prepare("INSERT INTO dataFTS (docid, message, poster) VALUES ($docid, $message, $poster);");

        stmtFTS.run({
              $docid: docid,
              $message: message,
              $poster: poster,
          });

        stmtFTS.finalize();

        // For stats per word
        this.db.serialize((function() {

            this.db.exec("BEGIN");

            // Remove Slack stuff
            message = message.replace(/<[^>]*>/gi, ' ');

            // Remove emojis
            message = message.replace(/:[^:]*:/gi, ' ');

            // Clean links and special characters
            message = message.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
            message = message.replace(/[-'`‘’«»“”¶§¡øØ°—–€¥$@#‰£≠±÷…•∞¿´„•≥≤~√⁄≈›‹Ω‡∑∂∆ƒ·ﬁﬂ|¬π∏ºª†™®‚◊¨~!@#$%^&*()_|+=?;'",.<>\{\}\[\]\\\/]/gi, ' ');

            // Remove stop words from list
            message = message.replace(this.stopwords_regex, '');

            var words = message.trim().replace(/ +(?= )/gi,'').split(/[\s,]+/);

            for (var i = 0; i < words.length; i++) {

              // We need significant words
              if (words[i].length < 4) { continue; }

              //Try to update any existing row then
              // Make sure it exists
              var stmtStats = this.db.prepare("UPDATE OR IGNORE stats SET count = count + 1 WHERE word = $word AND poster = $poster AND channel = $channel;");
              stmtStats.run({
                    $word: words[i],
                    $poster: poster,
                    $channel: channel
                });

              var stmtStats2 = this.db.prepare("INSERT OR IGNORE INTO stats (word, poster, channel) VALUES ($word, $poster, $channel);");
              stmtStats2.run({
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

p.search = function(text, channel, poster, return_html, callback) {

  var sql = "SELECT docid, *, d.message_raw AS message_raw FROM dataFTS f JOIN data d ON d.id = f.docid WHERE f.message MATCH $search AND f.channel = $channel;";
  var params = { $search: text, $channel: channel };

  if (poster != null) {
    sql += " AND poster = $poster";
    params = { $search: text, $channel: channel, $poster: poster };
  }

  this.db.serialize((function() {

    var results = []; 
    this.db.each(sql, params, function(err, row) {
        results.push({ "docid" : row.docid, "message": (return_html?row.message:row.message_raw), "poster": row.poster, "timestamp": row.timestamp });
    }, function(err, nb) {
      callback(results)
    });

  }).bind(this));

}

p.getMessages = function(channel, from_date, to_date, callback) {

  var sql = "SELECT * FROM data WHERE channel = $channel AND timestamp > $from AND timestamp < $to;"
  var params = { $channel: channel, $from: from_date, $to: to_date };

  this.db.serialize((function() {

    var results = [];
    this.db.all(sql, params, function(err, rows) {
      callback(rows)
    });

  }).bind(this));

}

p.stat = function(channel, callback) {

  var sql_timestamp = "SELECT MIN(timestamp) AS min_t FROM data WHERE channel = $channel;";
  var sql_total = "SELECT poster, AVG(msg_count) AS average, SUM(msg_count) AS total FROM (SELECT poster, timestamp, COUNT(*) AS msg_count FROM data WHERE channel = $channel GROUP BY timestamp/(1000*60*60*24), poster) a GROUP BY poster;"
  var sql_words = "SELECT word, poster, MAX(count) as word_count FROM stats WHERE channel = $channel GROUP BY poster;";
  var params = { $channel: channel };

  this.db.serialize((function() {

    var results = []; 

    this.db.each(sql_words, params, function(err, row) {
        if (row) {
          results[row.poster]= { "word" : row.word, "word_count": row.word_count, "total": 0, "average": 0 };
        }
    }, (function(err, nb) {
      this.db.each(sql_total, params, function(err, row) {
          if (row && results[row.poster]) {
            results[row.poster].total = row.total;
            results[row.poster].average = row.average;
          }
      }, (function(err, nb) {
        this.db.get(sql_timestamp, params, function(err, row) {
          results['special_timestamp'] = row.min_t;
          callback(results)
        });
      }).bind(this));
    }).bind(this));

  }).bind(this));
}

module.exports = SQLiteWrapper
