Slack History Extended
---

A bot that stores all messages and enables full deep search via in-app commands.

#### Installation

    npm install
    sqlite3 db.sqlite < structure.sqlite

#### Run

    node index.js

#### Stats

The following stat block will be displayed :

     | User     | Most common word        | Messages count |
     | @user1   | oklm (1492 occurences)  | 56 023         |
     | @user2   | oklm (1492 occurences)  | 34 195         |
        ...
     | @userN   | oklm (1492 occurences)  | 123 475        |