# Questions
Open Trivia supports three types of questions: Multiple Choice (MC), Short Answer (SA), and External (SP). 

## File Format
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

## Question Types
### Multiple Choice
- Five options, keyed as OptA, OptB, OptC, OptD, and OptE respectively 
- Answer is a single character uppercase string (i.e., `"A"`). 
- As of v2.0.0, "select all" style questions are now supported! If your answer has multiple letters (i.e., `"ABC"`), the question will automatically convert to a "select all". 
  - If you choose to do this, the answer options **must** be written out in alphabetical order. For example, `"CBA"` **will not work** with the scoring engine. 

### Short Answer 
- One question with one answer
- Users have unlimited attempts until time runs out
- A modified levenshtein distance formula is used to determine whether an answer is accepted or not
  - Trailing spaces and capitalization differences are ignored
  - The first character **must** be correct
  - A levenshtein distance of **1** is acceptable for answers 5-9 characters long, and a distance of **2** is acceptable for answers more than 9 characters long. 
  - Example: If an answer was `potato`, then: 
    - `potato`, `POTATO`, `Potatos` are all acccepted 
    - `tomato`, `protatato` are not accepted

### Special (External)
- Instead of asking a scorable question, provide a link to an external page under the `Question` key. 
- The link will be presented to all contestants when the question is selected

## Timed Questions
When the `Timed` key is set to true for a question, then a tiebreaker score (exponentially decreasing, dependent on how long it takes for a team to answer correctly) will be calculated. 

In addition, it will provide instant feedback for teams, which is helpful for questions where teams can try multiple times (at the expense of a lower tiebreaker score). This key is best used for short answer questions; it is not intended for use with multiple choicoe questions. 