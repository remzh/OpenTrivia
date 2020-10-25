# Open Trivia
Welcome to Open Trivia! This documentation is not fully completed yet, but it's enough to get one started. 

## What is it? 
Think of it like [Socrative](https://socrative.com/), except less test-like and more flexixble.  OpenTrivia is an all-in-one trivia server that handles a client interface, a host interface, and a slideshow interface (to be projected). It supports the following: 
- (Technically) unlimited teams, rounds, and questions. Your mileage will vary based on the specs of your server 
- Multimedia support with images, audio, and videos 
- Multiple choice, short answer, and third-party answering formats 
- Easy and intuitive question bank editor, also known as Google Sheets (optional)

## Why? 
Inspired by the lack of customizability in existing (free) platofrms like Kahoot, Open Trivia is fully customizable while still having everything you need right out of the go. 

## Quickstart
You'll need to create a `credentials.json` file under the `secure` folder, and provide three keys: `database`, `sessionKey`, and `hostPassword`. 

The `hostPassword` should begin with "host" and is used to give access to the slideshow and host dashboard. The `database` must be a MongoDB or MongoDB compatible database. 

Here's an example: 
```json
{
  "database": "mongodb://localhost:27017/opentrivia", 
  "sessionKey": "(random string)", 
  "hostPassword": "host12345678"
}
```
Additionally, you'll need a `scoring.json` file under the `secure` folder as well. There's one key in it for now, `countedRounds`, which will determine which rounds are factored into the overall scoring/rank. 

This feature exists in case you want to have a practice, unscored round before the main competition and/or rounds whose scores aren't tied into the overall rankings (i.e., a bonus round). 
```json
{
  "countedRounds": [1, 2, 3, 4, 5, 6]
}
```

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