import express from 'express';
import session from 'express-session';
import https from 'https';
import httpStatus from 'http-status';
import querystring from 'querystring';
import axios from 'axios';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import jwtMiddleWare from 'express-jwt';
import memorystore from 'memorystore';
import cors from 'cors';

import { findOrCreateUser, updateUser } from '../db/user';

import {
  getConsumptionLoadCurve,
  getConsumptionMaxPower,
  getDailyConsumption,
  getDailyProduction,
  refreshData,
  deleteMyData,
} from './data';

import { getUserFromEnedis, getMyData } from './user';

// Heroku gères les variables d'environement donc le '.env' est utilisé que pour le processus de développement
if (process.env !== 'PRODUCTION') dotenv.config();

// Create express application
const app = express();

// CORS
app.use(cors());

// create memorystore
const Memorystore = memorystore(session);
// create seesion & uses the session to store state
app.use(
  session({
    genid: (req) => {
      console.log('Inside session middleware');
      console.log(req.sessionID);
      return (Math.random() + 1).toString(36).substring(7);
      // return genuuid() // use UUIDs for session IDs
    },
    secret: process.env.SESSION_SECRET,
    store: new Memorystore({
      checkPeriod: 86400000, // prune expired entries every 24h
    }),
    resave: true,
    saveUninitialized: true
  }),
);

// Catch errors
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('invalid token...');
  }
});

// // When a user wishes to connect
const login = (req, res) => {
  req.session.state = (Math.random() + 1).toString(36).substring(7);

  // Add test client number (from 0 to 4) to the end of state (cf documentation)
  if (req.query.testClientId) {
    req.session.state = req.session.state + req.query.testClientId;
  } else {
    // if no specific client is specified, default to client 0
    req.session.state = req.session.state + '0';
  }
  req.session.save();

  console.log(req.sessionID);
  // Redirect user to login page on enedis
  const redirectUrl =
    'https://gw.hml.api.enedis.fr/group/espace-particuliers/consentement-linky/oauth2/authorize' +
    '?' +
    `client_id=${process.env.CLIENT_ID}` +
    `&state=${req.session.state}` +
    `&duration=${process.env.DURATION}` + // duration est la durée du consentement que vous souhaitez obtenir : cette durée est à renseigner au format ISO 8601 (exemple : « P6M » pour une durée de 6 mois),
    '&response_type=code' +
    `&redirect_uri=${process.env.REDIRECT_URI}`;
  console.log('Redirect URL : ' + redirectUrl);
  return res.redirect(redirectUrl);
};

// // This function catches the redirection of enedis after login
const redirect = (req, res) => {
  // verify that the state is correct
  if (req.session.state !== req.query.state) {
    return res.sendStatus(httpStatus.FORBIDDEN);
  }

  const usagePointId = req.query.usage_point_id;
  const postData = querystring.stringify({
    code: req.query.code,
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'authorization_code',
  });

  const url = `https://gw.hml.api.enedis.fr/v1/oauth2/token?redirect_uri=${
    process.env.REDIRECT_URI
  }`;

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  axios
    .post(url, postData, options)
    .then(r => {
      if (r.status === 200) return r.data;
      throw new Error(r.status);
    })
    .then(data => {
      const expiresAt = new Date(
        parseInt(data.expires_in, 10) * 1000 + parseInt(data.issued_at, 10),
      );

      // get user information from enedis to create user
      getUserFromEnedis(data.access_token, usagePointId).then(client => {
        return findOrCreateUser(
          client.identity.natural_person.firstname,
          client.identity.natural_person.lastname,
          client.customer_id,
          data.access_token,
          data.refresh_token,
          usagePointId,
          expiresAt,
        ).spread((user, created) => {
          updateUser(user, {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            usagePointId,
            expiresAt,
          });
          // redirect for the app to catch this route
          return res.redirect(
            `enedis-third-party-app://auth_complete?user=${jwt.sign(
              { id: user.id, usagePointId: user.usagePointId },
              process.env.JWT_SECRET,
            )}`,
          );
        });
      });
    })
    .catch(err => console.log(err));
};

// Routes
app.get('/', (req, res) => res.send('ENEDIS API'));
app.get('/login', login);
app.get('/redirect', redirect);
app.get('/me', jwtMiddleWare({ secret: process.env.JWT_SECRET }), getMyData);
app.get('/deleteme', jwtMiddleWare({ secret: process.env.JWT_SECRET }), deleteMyData);
app.get(
  '/metering/consumption_load_curve',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  getConsumptionLoadCurve,
);

app.get(
  '/metering/consumption_max_power',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  getConsumptionMaxPower,
);

app.get(
  '/metering/daily_consumption',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  getDailyConsumption,
);

app.get(
  '/metering/daily_production',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  getDailyProduction,
);

app.get(
  '/metering/refresh/consumption_load_curve',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  (req, res) => {
    refreshData(req, res, 'consumption_load_curve');
  },
);
app.get(
  '/metering/refresh/consumption_max_power',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  (req, res) => {
    refreshData(req, res, 'consumption_max_power');
  },
);
app.get(
  '/metering/refresh/daily_consumption',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  (req, res) => {
    refreshData(req, res, 'daily_consumption');
  },
);
app.get(
  '/metering/refresh/daily_production',
  jwtMiddleWare({ secret: process.env.JWT_SECRET }),
  (req, res) => {
    refreshData(req, res, 'daily_production');
  },
);

// Listen to port specified by the .env or 3001
app.listen(process.env.PORT || 3001, () => console.log('ENEDIS API'));
