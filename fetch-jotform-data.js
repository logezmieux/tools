// Get .env data
require('dotenv').config();

// Requirements
const _ = require('lodash');
const fetch = require('node-fetch');
const fs = require('fs');

// Global variables
const batchSize = 20;
const max = 300;
const url = `https://api.jotform.com/form/${process.env.JOTFORM_ID}/submissions?apiKey=${process.env.JOTFORM_API}`;

const getAllDataFromSite = () => {
  for (let index = 0; index < max; index = index + batchSize) {
    fetch(`${url}&limit=${batchSize}&offset=${index}`)
      .then((res) => res.json())
      .then((data) => {
        console.log(`⚙️Running batch ${index}...`);

        fs.writeFile(
          `data/batch/fetch-batch-${index}.json`,
          JSON.stringify(data),
          function (err) {
            if (err) throw err;
            console.log(`✅ Batch file ${index} created!`);
          }
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }
};

getAllDataFromSite();
