'use strict';

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _expressSession = require('express-session');

var _expressSession2 = _interopRequireDefault(_expressSession);

var _https = require('https');

var _https2 = _interopRequireDefault(_https);

var _httpStatus = require('http-status');

var _httpStatus2 = _interopRequireDefault(_httpStatus);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _dotenv = require('dotenv');

var _dotenv2 = _interopRequireDefault(_dotenv);

var _jsonwebtoken = require('jsonwebtoken');

var _jsonwebtoken2 = _interopRequireDefault(_jsonwebtoken);

var _expressJwt = require('express-jwt');

var _expressJwt2 = _interopRequireDefault(_expressJwt);

var _memorystore = require('memorystore');

var _memorystore2 = _interopRequireDefault(_memorystore);

var _cors = require('cors');

var _cors2 = _interopRequireDefault(_cors);

var _user = require('../db/user');

var _data = require('./data');

var _user2 = require('./user');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// Heroku gères les variables d'environement donc le '.env' est utilisé que pour le processus de développement
if (process.env !== 'PRODUCTION') _dotenv2.default.config();

// Create express application
var app = (0, _express2.default)();

// CORS
app.use((0, _cors2.default)());

// create memorystore
var Memorystore = (0, _memorystore2.default)(_expressSession2.default);
// create seesion & uses the session to store state
app.use((0, _expressSession2.default)({
  genid: function genid(req) {
    console.log('Inside session middleware');
    console.log(req.sessionID);
    return (Math.random() + 1).toString(36).substring(7);
    // return genuuid() // use UUIDs for session IDs
  },
  secret: process.env.SESSION_SECRET,
  store: new Memorystore({
    checkPeriod: 86400000 // prune expired entries every 24h
  }),
  resave: true,
  saveUninitialized: true
}));

// Catch errors
app.use(function (err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    res.status(401).send('invalid token...');
  }
});

// // When a user wishes to connect
var login = function login(req, res) {
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
  var redirectUrl = 'https://gw.hml.api.enedis.fr/group/espace-particuliers/consentement-linky/oauth2/authorize' + '?' + ('client_id=' + process.env.CLIENT_ID) + ('&state=' + req.session.state) + ('&duration=' + process.env.DURATION) + // duration est la durée du consentement que vous souhaitez obtenir : cette durée est à renseigner au format ISO 8601 (exemple : « P6M » pour une durée de 6 mois),
  '&response_type=code' + ('&redirect_uri=' + process.env.REDIRECT_URI);
  console.log('Redirect URL : ' + redirectUrl);
  return res.redirect(redirectUrl);
};

// // This function catches the redirection of enedis after login
var redirect = function redirect(req, res) {
  // verify that the state is correct
  if (req.session.state !== req.query.state) {
    return res.sendStatus(_httpStatus2.default.FORBIDDEN);
  }

  var usagePointId = req.query.usage_point_id;
  var postData = _querystring2.default.stringify({
    code: req.query.code,
    client_id: process.env.CLIENT_ID,
    client_secret: process.env.CLIENT_SECRET,
    grant_type: 'authorization_code'
  });

  var url = 'https://gw.hml.api.enedis.fr/v1/oauth2/token?redirect_uri=' + process.env.REDIRECT_URI;

  var options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  _axios2.default.post(url, postData, options).then(function (r) {
    if (r.status === 200) return r.data;
    throw new Error(r.status);
  }).then(function (data) {
    var expiresAt = new Date(parseInt(data.expires_in, 10) * 1000 + parseInt(data.issued_at, 10));

    // get user information from enedis to create user
    (0, _user2.getUserFromEnedis)(data.access_token, usagePointId).then(function (client) {
      return (0, _user.findOrCreateUser)(client.identity.natural_person.firstname, client.identity.natural_person.lastname, client.customer_id, data.access_token, data.refresh_token, usagePointId, expiresAt).spread(function (user, created) {
        (0, _user.updateUser)(user, {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          usagePointId: usagePointId,
          expiresAt: expiresAt
        });
        // redirect for the app to catch this route
        return res.redirect('enedis-third-party-app://auth_complete?user=' + _jsonwebtoken2.default.sign({ id: user.id, usagePointId: user.usagePointId }, process.env.JWT_SECRET));
      });
    });
  }).catch(function (err) {
    return console.log(err);
  });
};

// Routes
app.get('/', function (req, res) {
  return res.send('ENEDIS API');
});
app.get('/login', login);
app.get('/redirect', redirect);
app.get('/me', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _user2.getMyData);
app.get('/deleteme', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _data.deleteMyData);
app.get('/metering/consumption_load_curve', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _data.getConsumptionLoadCurve);

app.get('/metering/consumption_max_power', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _data.getConsumptionMaxPower);

app.get('/metering/daily_consumption', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _data.getDailyConsumption);

app.get('/metering/daily_production', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), _data.getDailyProduction);

app.get('/metering/refresh/consumption_load_curve', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), function (req, res) {
  (0, _data.refreshData)(req, res, 'consumption_load_curve');
});
app.get('/metering/refresh/consumption_max_power', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), function (req, res) {
  (0, _data.refreshData)(req, res, 'consumption_max_power');
});
app.get('/metering/refresh/daily_consumption', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), function (req, res) {
  (0, _data.refreshData)(req, res, 'daily_consumption');
});
app.get('/metering/refresh/daily_production', (0, _expressJwt2.default)({ secret: process.env.JWT_SECRET }), function (req, res) {
  (0, _data.refreshData)(req, res, 'daily_production');
});

// Listen to port specified by the .env or 3001
app.listen(process.env.PORT || 3001, function () {
  return console.log('ENEDIS API');
});
//# sourceMappingURL=index.js.map