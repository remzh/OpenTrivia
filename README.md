# Open Trivia
Welcome to Open Trivia! 

## What is it? 
Think of it like [Socrative](https://socrative.com/), except less test-like and more flexible.  OpenTrivia is an all-in-one trivia server that handles a client interface, a host interface, and a slideshow interface (intended to be projected/presented). It supports the following: 
- (Technically) unlimited teams, rounds, and questions. Your mileage will vary based on the specs of your server 
- Image support and customizable backgrounds to liven up your "slides" 
- Multiple choice, short answer, and third-party answering formats 
- Easy and intuitive question bank editor, also known as Google Sheets (alternatively, JSON can also be used)

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

Check out the specifications section below for details on the column headers required in the `OT_QUESTIONS` spreadsheet.

## Specifications
Open Trivia supports three types of questions: Multiple Choice (MC), Short Answer (SA), and External (SP). 

### Questions
Questions can be written in JSON or in a spreadsheet. Open Trivia has native support for reading questions from a Google Sheet, so long as said spreadsheet follows a specific format. Below is a list of keys and what they mean for each question: 

Key|Required|Description
-|-|-
Round|Yes|(Integer) Number representing the round the question belongs to. Used for scoring.
Timed|Yes|(Boolean) True if the timer should show/be enabled for the question. 
Category|Yes|(String) The category the question belongs to, shown on the top left of the question slideshow. 
Q|Yes|(Integer) Number representing the question number. 
Type|Yes|(String:"MC"\|"SA"\|"SP") A value representing which type of question it is
Question|Yes|(String) The question to ask. 
Image|No|(String:URL) A URL of an image to show for the question. 
Answer|Yes for MC and SA, No for SP|(String) The answer to the question, either a letter corresponding to the option (MC) or the actual answer (SA)
OptA, OptB, OptC, OptD, OptE|Yes for MC, No otherwise|(String) Answers for each option. 

### Multiple Choice
- Five options, keyed as OptA, OptB, OptC, OptD, and OptE respectively 
- Answer is a single character uppercase string (i.e., `"A"`). 

### Short Answer 
- One question with one answer
- Users have unlimited attempts until time runs out
- A modified levenshtein distance formula is used to determine whether an answer is accepted or not
  - Whitespace and capitalization differences are ignored
  - The first character **must** be correct
  - A levenshtein distance of **2** is acceptable for answers <= 10 characters, otherwise a levenshtein distance of **3** is acceptable 
  - Example: If an answer was `potato`, then: 
    - `potato`, `POTATO`, `Potatos` are all acccepted 
    - `tomato`, `protatato` are not accepted

### Special (External)
- Instead of asking a scorable question, provide a link to an external page under the `Question` key. 
- The link will be presented to all contestants when the question is selected
