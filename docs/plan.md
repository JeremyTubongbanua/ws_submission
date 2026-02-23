# plan

## Major Components

- Chrome extension (automatically fills in box with appropriate response)
- Main dashboard (web based)
- Daemon scraper
- Backend system (serves frontend runs the LLM, puts stuff into database)

## Defined lists

- subreddits
- key words in comments

## Subagents

- Filter Agent --> 2nd layer of the scraping process, determines whether something should be triaged or not
- Commenting Agent --> embedded in the chrome extension

## Overall Flow

Train an LLM to be understanding of WS's product line, market advantages and product-market fit
- LLM should NOT give out personal finance advice

scraper that scrapes selective various Reddit conversations, X conversations, YouTube comments
- LLM determines whether it is 

- 1. Web Scraper that adds new posts (from #defined-lists) to the scraper triage
- 2. Filter agent decides if it is worth a human reading and moves from scraper triage to user triage
- 3. User looks into the user triage and moves it into the generate column
- 4. In the generate column, they are sent to the commenting agent where it will generate a comment
- 5. Now they are in the "For Review" column where it will be viewable in both the dashboard and in the chrome extension
- 6. User can click on an element in the "For Review" column and it will bring the browser to the link, where clicking on the comment box will also
automatically fill it in and give you the option of pressing comment
