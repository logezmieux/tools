import dotenv from 'dotenv';
dotenv.config();

import _ from 'lodash';
import fs from 'fs';
import fetch from 'node-fetch';
import axios from 'axios';
import FormData from 'form-data';
import Slugify from 'slugify';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const googleGeoKey = process.env.GOOGLE_GEO_API;
const googleStreetKey = process.env.GOOGLE_STREET_API;
const supabase = createClient(supabaseUrl, supabaseKey);

const insertToApartmentFromFile = async () => {
  const dirname = `data/batch/`;

  fs.readdir(dirname, function (err, filenames) {
    if (err) throw err;

    filenames.forEach(function (filename) {
      fs.readFile(dirname + filename, 'utf-8', function (err, data) {
        if (err) throw err;

        try {
          const obj = JSON.parse(data);
          obj.content.map((x, i) => {
            // if(x.status === "ACTIVE" && i === 0) {
            if (x.status === 'ACTIVE') {
              setTimeout(function () {
                createSingle(x);
              }, i * 2000);
            }
          });
        } catch {
          console.error('Error parsing JSON:', err, filename);
        }
      });
    });
  });
};

const createSingle = async (data) => {
  const answers = Object.entries(data.answers);
  const slug = Slugify(
    answers.find(([key, value]) => value.name === 'address')[1].answer,
    {
      remove: /[*+~.()'"!:@]/g,
      lower: true,
      strict: true,
    }
  );
  const suite = answers.find(([key, value]) => value.name === 'apt')[1].answer
    ? answers.find(([key, value]) => value.name === 'apt')[1].answer
    : null;

  try {
    const geocode = await getGeoData(slug);

    if (geocode.status === 'OK') {
      let geoData = {};
      geocode.results[0].address_components.map(
        (x) => (geoData[x.types[0]] = x.long_name)
      );
      geoData['location'] = geocode.results[0].geometry.location;

      try {
        let isNotExist = await isNotAlreadyExist(
          geoData.street_number,
          geoData.route,
          geoData.locality
        );

        if (isNotExist) {
          const image = await downloadAndSaveImages(
            slug,
            geoData.location.lat,
            geoData.location.lng
          );

          const createdId = await insertNewApartment(
            geoData.street_number,
            geoData.route,
            geoData.locality,
            geoData.administrative_area_level_1,
            geoData.postal_code,
            geoData.country,
            geoData.location.lat,
            geoData.location.lng,
            image
          );
          if (createdId) console.log('New *APARTMENT* created!', createdId);

          // Create suite data
          if (suite) {
            try {
              const suiteId = await insertNewSuite(createdId, suite);
              const reviewId = await insertNewReview(
                createdId,
                suiteId,
                answers
              );

              if (suiteId)
                console.log(
                  'New *SUITE* & *REVIEW* created!',
                  suiteId,
                  reviewId
                );
            } catch {
              console.error('Error creating suite & review');
            }
          } else {
            try {
              const reviewId = await insertNewReview(createdId, null, answers);

              if (reviewId) console.log('New *REVIEW* created!', reviewId);
            } catch {
              console.error('Error creating review');
            }
          }
        } else {
          console.error(
            geoData.street_number,
            geoData.route,
            geoData.locality,
            'already exist'
          );
        }
      } catch {
        console.error('Cannot find GEO');
      }
    }
  } catch {
    console.error('Cannot fetch external data');
  }
};

const isNotAlreadyExist = async (street_number, route, city) => {
  let { data: apartment, error } = await supabase
    .from('apartment')
    .select('*')
    .eq('street_number', street_number)
    .eq('route', route)
    .eq('city', city);

  if (error) console.error(error);

  return _.isEmpty(apartment);
};

const insertNewApartment = async (
  street_number,
  route,
  city,
  province,
  postal,
  country,
  lat,
  lng,
  image
) => {
  const { data, error } = await supabase.from('apartment').insert([
    {
      street_number: street_number,
      route: route,
      city: city,
      postal: postal,
      province: province,
      country: country,
      lat: lat,
      lng: lng,
      image: image,
    },
  ]);

  if (error) console.error(error);

  return data[0].id;
};

const insertNewSuite = async (id, suite) => {
  const { data, error } = await supabase.from('suite').insert([
    {
      apt_id: id,
      door: suite,
    },
  ]);

  if (error) console.error(error);

  return data[0].id;
};

const insertNewReview = async (aptId, suiteId, answers) => {
  const { data, error } = await supabase.from('review').insert([
    {
      apt_id: aptId,
      suite_id: suiteId ? suiteId : null,
      price: convertToInt(
        answers.find(([key, value]) => value.name === 'price')[1].answer
      ),
      last_year: convertToInt(
        answers.find(([key, value]) => value.name === 'lastYear')[1].answer
      ),
      duration: convertDuration(
        answers.find(([key, value]) => value.name === 'duration')[1].answer
      ),
      electricity: convertToBoolean(
        answers.find(([key, value]) => value.name === 'includes')[1].answer,
        0
      ),
      internet: convertToBoolean(
        answers.find(([key, value]) => value.name === 'includes')[1].answer,
        1
      ),
      furniture: convertToBoolean(
        answers.find(([key, value]) => value.name === 'includes')[1].answer,
        2
      ),
      heat: convertToBoolean(
        answers.find(([key, value]) => value.name === 'includes')[1].answer,
        3
      ),
      water: convertToBoolean(
        answers.find(([key, value]) => value.name === 'includes')[1].answer,
        4
      ),
      bedbugs: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        0
      ),
      cockroaches: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        1
      ),
      ants: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        2
      ),
      mouses: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        3
      ),
      rats: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        4
      ),
      wasps: convertToBoolean(
        answers.find(([key, value]) => value.name === 'critters')[1].answer,
        5
      ),
      critter_solved: answers.find(
        ([key, value]) => value.name === 'yearSolved'
      )[1].answer
        ? convertToInt(
            answers.find(([key, value]) => value.name === 'yearSolved')[1]
              .answer
          )
        : -1,
      mold: convertToBoolean(
        answers.find(([key, value]) => value.name === 'humidity')[1].answer,
        0
      ),
      moisture: convertToBoolean(
        answers.find(([key, value]) => value.name === 'humidity')[1].answer,
        1
      ),
      leak: convertToBoolean(
        answers.find(([key, value]) => value.name === 'humidity')[1].answer,
        2
      ),
      lamination: convertToBoolean(
        answers.find(([key, value]) => value.name === 'thermal')[1].answer,
        0
      ),
      frost: convertToBoolean(
        answers.find(([key, value]) => value.name === 'thermal')[1].answer,
        1
      ),
      condensation: convertToBoolean(
        answers.find(([key, value]) => value.name === 'thermal')[1].answer,
        2
      ),
      sound: convertToScore(
        answers.find(([key, value]) => value.name === 'sound')[1].answer
      ),
      light: convertToScore(
        answers.find(([key, value]) => value.name === 'light')[1].answer
      ),
      interior: convertToScore(
        answers.find(([key, value]) => value.name === 'interior')[1].answer
      ),
      outdoor: convertToScoreFromString(
        answers.find(([key, value]) => value.name === 'inside')[1].answer,
        0
      ),
      garden: convertToScoreFromString(
        answers.find(([key, value]) => value.name === 'inside')[1].answer,
        1
      ),
      common_part: convertToScoreFromString(
        answers.find(([key, value]) => value.name === 'inside')[1].answer,
        2
      ),
      noise: convertToBoolean(
        answers.find(([key, value]) => value.name === 'noise')[1].answer
      ),
      public_transport: convertToBoolean(
        answers.find(([key, value]) => value.name === 'publicTransport')[1]
          .answer
      ),
      neighborhood_comment: answers.find(
        ([key, value]) => value.name === 'noiseComment'
      )[1].answer,
      neighborhood_note: convertToScore(
        answers.find(([key, value]) => value.name === 'neighborhoodNote')[1]
          .answer
      ),
      neighborhood_safety: convertToScore(
        answers.find(([key, value]) => value.name === 'safety')[1].answer
      ),
      accessibility: convertToScore(
        answers.find(([key, value]) => value.name === 'accessibility')[1].answer
      ),
      parking: convertToBoolean(
        answers.find(([key, value]) => value.name === 'parking')[1].answer
      ),
      snow_removal: convertToBoolean(
        answers.find(([key, value]) => value.name === 'snowRemoval')[1].answer
      ),
      owner_relationship: convertToScore(
        answers.find(([key, value]) => value.name === 'owner')[1].answer,
        0
      ),
      owner_communication: convertToScore(
        answers.find(([key, value]) => value.name === 'owner')[1].answer,
        1
      ),
      owner_reactivity: convertToScore(
        answers.find(([key, value]) => value.name === 'owner')[1].answer,
        2
      ),
      global_comment: answers.find(
        ([key, value]) => value.name === 'globalComment'
      )[1].answer
        ? answers
            .find(([key, value]) => value.name === 'globalComment')[1]
            .answer.replace(/(<([^>]+)>)/gi, '')
        : null,
    },
  ]);

  if (error) console.error(error);

  return data[0].id;
};

const convertToScoreFromString = (data, index = 0) => {
  const keys = Object.keys(data);
  const currentKey = keys[index];
  const value = data[currentKey].replace(/[\[\]"]/g, '');

  switch (value) {
    case 'Très mauvais':
      return 1;
    case 'Mauvais':
      return 2;
    case 'Bon':
      return 3;
    case 'Très bon':
      return 4;
    case 'Excellent':
      return 5;
    default:
      return 0;
  }
};
const convertToScore = (data, index = 0) =>
  data
    ? _.isNumber(index)
      ? Math.round((convertToInt(Object.values(data)[index]) / 7) * 5)
      : Math.round(convertToInt(data) / 7) * 5
    : 0;
const convertToInt = (data) => (data ? parseInt(data) : null);
const convertToBoolean = (data, index) => {
  const answer = data
    ? _.isNumber(index)
      ? Object.values(data)[index].toLowerCase()
      : data.toLowerCase()
    : null;

  if (answer === 'oui' || answer === 'yes' || answer === 'true') {
    return true;
  }
  return false;
};
const convertDuration = (data) => {
  switch (data) {
    case 'De 1 an à 3 ans':
      return 2;
    case 'Plus de 3 ans':
      return 3;
    default:
      return 1;
  }
};

const getGeoData = async (address) => {
  const url = new URL(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${address}&&key=${googleGeoKey}`
  );
  const data = await await fetch(url, { method: 'GET' })
    .then((x) => x.json())
    .catch((error) => console.error(error));

  return data;
};

const downloadAndSaveImages = async (slug, lat, lng) => {
  const url = `https://maps.googleapis.com/maps/api/streetview?size=800x450&location=${lat.toString()},${lng.toString()}&fov=110&pitch=0&key=${googleStreetKey}&format=JPEG`;
  const filePath = `${slug}.jpg`;
  const bucketName = 'apt-images';
  const path = `${supabase.storage.url}/object/public/${bucketName}/${filePath}`;
  const fetch = await queryImage(url, filePath);

  return path;
};

const queryImage = async (url, filePath) => {
  return axios({
    url: url,
    method: 'get',
    responseType: 'stream',
  })
    .then((response) => {
      response.data.pipe(
        fs
          .createWriteStream(`data/assets/${filePath}`)
          .on('finish', () => console.log('➡️ Image created for ', filePath))
      );
    })
    .catch((err) => console.error(`🛑 Fail to download ${filePath} ` + err));
};

insertToApartmentFromFile();
