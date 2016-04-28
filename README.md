Slack History Extended
---

A bot that stores all messages and enables full deep search via in-app commands.

#### Installation

    npm install
    sqlite3 db.sqlite < structure.sqlite

#### Run

    node index.js

#### Search command

The search command is `/search "search terms or phrase"`.

It is a full-text search which is performed against the whole database through SQLite's FTS4.

A "see more" link will redirect to the backend for the actual search, and will display all results.

#### Stats

The global statistics command is `/stats`.

The following stat block will be displayed :

     | User              | Most common word                | Messages total   |
     --------------------------------------------------------------------------
     | @user1            | oklm (1492 occurences)          | 56 023  (3/d.avg)|
     | @user2            | oklm (1492 occurences)          | 34 195  (3/d.avg)|
        ...
     | @userN            | oklm (1492 occurences)          | 123 475 (3/d.avg)|


Per user statistics : `/stats user`

Top 5 words
 * word1       1492 occurences
 * word2       1492 occurences
 * word1       1492 occurences
 * word1       1492 occurences
 * word2       1492 occurences
Day most posted : Jan. 26 2016

