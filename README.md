# Importing Logezmieux original data

The original data come from a JotForm and was king of messy. So we automated the process of importing the data to supabase and then we cleaned it up.

## Setup

Create en `.env` file including the following variables:

```env
SUPABASE_URL=https://XXXXXX.supabase.co
SUPABASE_KEY=XXXXXX
GOOGLE_GEO_API=XXXXXX
GOOGLE_STREET_API=XXXXXX
JOTFORM_API=XXXXXX
JOTFORM_ID=XXXXXX
```

### Import data from JotForm

We use the [JotForm API](https://www.jotform.com/docs/api) to import the data.

Looping through it and saving files to `data/batch` folder using `yarn fetch`.

### Create single entry in Supabase

Originally, I wanted to create a single entry in Supabase using `yarn create`.

During the process, we'll also download and save image from Google Street View.
