Slack History Extended
---

A bot that stores all messages and enables full deep search and statistics via in-app commands.

#### Installation

    npm install
    sqlite3 db.sqlite < structure.sqlite

You must as well copy `config.json/dist` to `config.json` and edit the relevant configuration herein.

#### Run

    node index.js

#### Tokens

You must configure the Slack payload token that will be used to grant access to POST request from Slack, and also a token for GET access for the standalone pages.

If you plan on using the commands, you must as well configure the Slack command token.

All tokens reside in `config.json`.

#### Full history

A complete history (_excluding bots, and emoji reactions_) of each channel is available here :

http://your.host/[channel]

#### Search command

The search command is `/search "search terms or phrase"`.

It is a full-text search which is performed against the whole database through SQLite's [FTS4](https://www.sqlite.org/fts3.html#section_1).

A "see more" link will redirect to the backend for the actual search, and will display all results. You can access this view directly at :

http://your.host/search/[channel]/[terms_url_encoded]

#### Stats command

The global statistics command is `/stats`.

The following stat block will be displayed :

     | User              | Most common word                | Messages total   |
     --------------------------------------------------------------------------
     | @user1            | oklm (1492 occurences)          | 56 023  (3/d.avg)|
     | @user2            | oklm (1492 occurences)          | 34 195  (3/d.avg)|
        ...
     | @userN            | oklm (1492 occurences)          | 123 475 (3/d.avg)|

#### License

MIT.