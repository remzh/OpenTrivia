# Open Trivia
![MIT License](https://img.shields.io/github/license/remzh/OpenTrivia?style=flat-square)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/remzh/OpenTrivia?style=flat-square)

Welcome to Open Trivia! 

## Deprecation Notice
OpenTrivia will be superseded by a new trivia platform. This repository will no longer receive any updates.

----------------

**v2.0.0 -- Note that [Tabletop.js](https://github.com/jsoma/tabletop) has been deprecated, causing this version of OpenTrivia to no longer work.**

Due to the 1) degrading code quality (last-minute features meant many aspects must be manually setup directly in the code), 2) relatively poor and unintuitive backend UI (partly due to the pandemic, which significantly affected developement plans), and 3) the deprecation of Tabletop.js, Open Trivia v2 has also been deprecated. 

If you'd still like to use OpenTrivia, I recommend you using [PapaParse](https://www.npmjs.com/package/papaparse) and local CSV files to load questions and teams. Local files will work interchangably as long as you specify PapaParse to use headers. An example CSV file with different question types can be found under [docs/questions-example.csv](docs/questions-example.csv).

## What is it? 
Think of it like [Socrative](https://socrative.com/), except less test-like and more flexible.  Open Trivia is an all-in-one trivia server that handles a client interface, a host interface, and a slideshow interface (intended to be projected/presented). It supports the following: 
- (Technically) unlimited teams, rounds, and questions. Your mileage will vary based on the specs of your server 
  - Using an Azure B1 app server, Open Trivia handled 250+ simultaneous connections using under 1 GB of ram. You shouldn't need particularly high specs for most use cases. 
- Image support and customizable backgrounds to liven up your "slides" 
- Multiple choice, short answer, and third-party answering formats 
- Easy and intuitive question bank editor, also known as Google Sheets (alternatively, JSON can also be used)
- v2: Lots of new "addons" to extend platform functionality
  - Brackets addon: Create any number of 16-team brackets and let teams compete head to head! Currrently designed for single elimination, but can be modified for other tournamnet formats. Four games is all it takes to turn 16 teams into one winning team!
  - Divergence addon: Separate teams into "in contention" and "out of contention" when running elimination tournaments. This allows those who are out to still play!
  - Buzzer addon: Adds support for buzzers that whitelisted teams can use in lieu of answering on their device for live competitions! Supports a "top teams" scoreboard and interruptions.
  - Chat addon: Teams can chat with other teams! In its current state, chat is only active during bracket rounds, and messages are routed between the head to head teams. 

## Why? 
Inspired by the lack of customizability in existing (free) platofrms like Kahoot, Open Trivia is fully customizable while still having everything you need right out of the go. Because I'm not hosting for you, I don't need to charge monthly fees or paywall features!

## Quickstart
Open Trivia uses environment variables for setup and configuration. You can set them directly or place them in a `.env` file in the root directory of Open Trivia. 

Here's an example of a `.env` file along with descriptions of each key: 

```bash
# Database connection (must be a MongoDB or MongoDB compatible database)
DB_URL=mongodb://localhost:27017/opentrivia

# Session key (used for encrypting cookies)
SESSION_KEY=aaaaaaaaaaaa

# Password for accessing /host/* (slides and host controls)
# Must start with "host" but can be anything after that
HOST_KEY=host1234

# Question and user database links (Google Sheets)
OT_QUESTIONS=https://docs.google.com/spreadsheets/d/YOUR_URL/pubhtml
OT_USERS=https://docs.google.com/spreadsheets/d/YOUR_URL/pubhtml

# Scoring setup
# OT_SCORING_ROUNDS represents an array of rounds that are scored and OT_SCORING_MULT is the point multiplier for each round (i.e., in the example below each correct answer in round 1 is worth 10 points)
# Note that OT_SCORING_MULT is optional. Without it, Open
OT_SCORING_ROUNDS=1,2,3,4,5,6 
OT_SCORING_MULT=10,11,12,13,14,40 
```

The `OT_USERS` spreadsheet must have the following as column headers: 
Key|Value
-|-
TeamID|A unique ID assigned to each team. Scores are tied to each team's unique ID. 
TeamPIN|A unique password that allows each team to sign in. 
TeamName|The name of that team. Publicly displayed.
Members|A list of members present in that team. Displayed on scoreboards. 

Check out [questions.md](docs/questions.md) for details on the column headers required in the `OT_QUESTIONS` spreadsheet.

## Documentation
Check out the links below for details on how to use Open Trivia for your own event!

- [**Questions.md** - Question specifications and types](docs/questions.md)
  - Anyone who wants to make their own questions for this platform should read this. 
- [**Socketio.md** - Details on the different Socket.io events used and their specifications](docs/socketio.md)
  - Intended for developers who wish to extend Open Trivia functionality. 

## License
Open Trivia is licensed under the MIT license. You can view more information about this license in the [license.txt file](LICENSE.txt). 