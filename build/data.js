'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.deleteMyData = exports.refreshData = exports.getDailyProduction = exports.getDailyConsumption = exports.getConsumptionMaxPower = exports.getConsumptionLoadCurve = undefined;

var _axios = require('axios');

var _axios2 = _interopRequireDefault(_axios);

var _httpStatus = require('http-status');

var _httpStatus2 = _interopRequireDefault(_httpStatus);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _user = require('../db/user');

var _data = require('../db/data');

var _user2 = require('./user');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var jwtSecret = process.env.JWT_SECRET;

// gives
// [ {metadata, graph_data}, ... ]

/**
 * format elecricity data from enedis to store in database
 *
 * @param {object} data
 */
var formatDataFromEnedis = function formatDataFromEnedis(data) {
  var graphData = data.usage_point.map(function (_ref) {
    var meter_reading = _ref.meter_reading;
    var start = meter_reading.start,
        end = meter_reading.end,
        reading_type = meter_reading.reading_type,
        usage_point_id = meter_reading.usage_point_id;

    var d = {};

    d.metadata = {
      start: start,
      end: end,
      unit: reading_type.unit,
      usagePointId: usage_point_id
    };

    d.graph_data = meter_reading.interval_reading.map(function (point) {
      var timestamp = new Date(start);
      timestamp.setSeconds(timestamp.getSeconds() + reading_type.interval_length * (point.rank - 1));
      return { timestamp: timestamp, value: point.value };
    });

    return d;
  });

  return graphData;
};

/**
 * create strings from date that are 10 days apart
 */
var createDateStrings = function createDateStrings() {
  var start = new Date();
  start.setDate(start.getDate() - 10);
  return { end: new Date().toISOString(), start: start.toISOString() };
};

/**
 *
 * @param {string} URLType can be consumption_load_curve, consumption_max_power, daily_consumption, daily_production
 * @param {obj} req
 * @param {obj} res
 */
var getDataFromEnedis = function getDataFromEnedis(URLType, req, res) {
  var url = 'https://gw.hml.api.enedis.fr/v3/metering_data/' + URLType + '?' + ('start=' + createDateStrings().start) + ('&end=' + createDateStrings().end) + ('&usage_point_id=' + req.user.usagePointId);

  console.log(url);
  (0, _user2.getUserAccessToken)(req.user.id).then(function (accessToken) {
    var options = {
      method: 'get',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer ' + (accessToken || process.env.ACCESS_TOKEN)
      }
    };

    return _axios2.default.get(url, options);
  }).then(function (r) {
    if (r.status === 200) return r.data;
  }).then(function (data) {
    var graphData = formatDataFromEnedis(data); // [ {metadata, graph_data}, ... ]
    // Save data to database
    graphData.forEach(function (d) {
      (0, _data.createDataForUser)(req.user.id, d.graph_data, d.metadata.unit, _lodash2.default.camelCase(URLType), d.metadata.usagePointId);
    });
    res.send(graphData);
  }).catch(function (err) {
    if (err.response && err.response.status === 403) return res.send({ message: 'Le client est inconnu ou non habilité' });
    console.log(err);
    res.send("Un erreur s'est produit");
  });
};

/**
 * format the data from database to be used by the front end
 *
 * @param {[]object} data {timestamp, value, type, unit, usagePointId}
 */
var formatDataFromDB = function formatDataFromDB(data) {
  // { usagePointId: [],  ... }
  var tmp = {};
  data.forEach(function (e) {
    tmp[e.usagePointId] = tmp[e.usagePointId] || [];
    tmp[e.usagePointId].push({
      timestamp: e.timestamp,
      value: e.value
    });
  });
  // [{metadata: , data: [] }, ... ]
  var graph_data = Object.keys(tmp).map(function (id) {
    return {
      metadata: {
        start: data[0].timestamp,
        end: data[data.length - 1].timestamp,
        unit: data[0].unit,
        usagePointId: id
      },
      graph_data: tmp[id]
    };
  });
  return graph_data;
};

/**
 * get consumption load curve data
 *
 * @param {*} req
 * @param {*} res
 */
var getConsumptionLoadCurve = exports.getConsumptionLoadCurve = function getConsumptionLoadCurve(req, res) {
  // Is data in bdd
  (0, _data.getDataForUserByType)(req.user.id, 'consumptionLoadCurve').then(function (data) {
    if (data.length === 0) {
      // Data is not in bdd
      getDataFromEnedis('consumption_load_curve', req, res);
    } else {
      res.send(formatDataFromDB(data));
    }
  });
};

/**
 * get consumption max power data
 *
 * @param {*} req
 * @param {*} res
 */
var getConsumptionMaxPower = exports.getConsumptionMaxPower = function getConsumptionMaxPower(req, res) {
  // Is data in bdd
  (0, _data.getDataForUserByType)(req.user.id, 'consumptionMaxPower').then(function (data) {
    if (data.length === 0) {
      // Data is not in bdd
      getDataFromEnedis('consumption_max_power', req, res);
    } else {
      res.send(formatDataFromDB(data));
    }
  });
};

/**
 * get daily consumption data
 *
 * @param {*} req
 * @param {*} res
 */
var getDailyConsumption = exports.getDailyConsumption = function getDailyConsumption(req, res) {
  // Is data in bdd
  (0, _data.getDataForUserByType)(req.user.id, 'dailyConsumption').then(function (data) {
    if (data.length === 0) {
      // Data is not in bdd
      getDataFromEnedis('daily_consumption', req, res);
    } else {
      res.send(formatDataFromDB(data));
    }
  });
};

/**
 * get daily production data
 *
 * @param {*} req
 * @param {*} res
 */
var getDailyProduction = exports.getDailyProduction = function getDailyProduction(req, res) {
  // Is data in bdd
  (0, _data.getDataForUserByType)(req.user.id, 'dailyProduction').then(function (data) {
    if (data.length === 0) {
      // Data is not in bdd
      getDataFromEnedis('daily_production', req, res);
    } else {
      res.send(formatDataFromDB(data));
    }
  });
};

// datatype needs to be in snake_case
var refreshData = exports.refreshData = function refreshData(req, res, dataType) {
  getDataFromEnedis(dataType, req, res);
};

var deleteMyData = exports.deleteMyData = function deleteMyData(req, res) {
  return (0, _data.deleteDataForUser)(req.user.id).then(function (affectedRows) {
    res.send('ok');
  }).catch(function (err) {
    console.log(err);
  });
};
//# sourceMappingURL=data.js.map