# Bible text

- `myajvb/`: Judson Burmese Bible (1840), public domain, from eBible.org (myajvb).
- `kjv/`: King James Version, public domain (outside the UK), from eBible.org (eng-kjv), without the
  Apocrypha. Brackets around italic words are removed.

Each book is a JSON file named by its USFM code (e.g. `JHN.json`): an array of chapters, each an
array of verse texts (index 0 is verse 1). An empty string means the verse is missing in that
translation. `books.json` lists the books in order with English and Burmese names, the names and
abbreviations used to find them, and the number of verses in each chapter.
