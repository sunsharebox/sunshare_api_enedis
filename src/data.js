import axios from 'axios';
import httpStatus from 'http-status';
import querystring from 'querystring';
import { getUserByEnedisId } from '../db/user';
import { getDataForUserByType, createDataForUser, deleteDataForUser } from '../db/data';
import { getUserAccessToken } from './user';
import _ from 'lodash';

const jwtSecret = process.env.JWT_SECRET;

// gives
// [ {metadata, graph_data}, ... ]

/**
 * format elecricity data from enedis to store in database
 *
 * @param {object} data
 */
const formatDataFromEnedis = data => {
  const graphData = data.usage_point.map(({ meter_reading }) => {
    const { start, end, reading_type, usage_point_id } = meter_reading;
    const d = {};

    d.metadata = {
      start,
      end,
      unit: reading_type.unit,
      usagePointId: usage_point_id,
    };

    d.graph_data = meter_reading.interval_reading.map(point => {
      const timestamp = new Date(start);
      timestamp.setSeconds(
        timestamp.getSeconds() + reading_type.interval_length * (point.rank - 1),
      );
      return { timestamp, value: point.value };
    });

    return d;
  });

  return graphData;
};

/**
 * create strings from date that are 10 days apart
 */
const createDateStrings = () => {
  const start = new Date();
  start.setDate(start.getDate() - 10);
  return { end: new Date().toISOString(), start: start.toISOString() };
};

/**
 *
 * @param {string} URLType can be consumption_load_curve, consumption_max_power, daily_consumption, daily_production
 * @param {obj} req
 * @param {obj} res
 */
const getDataFromEnedis = (URLType, req, res) => {
  const url =
    `https://gw.hml.api.enedis.fr/v3/metering_data/${URLType}` +
    '?' +
    `start=${createDateStrings().start}` +
    `&end=${createDateStrings().end}` +
    `&usage_point_id=${req.user.usagePointId}`;

  console.log(url);
  getUserAccessToken(req.user.id)
    .then(accessToken => {
      const options = {
        method: 'get',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken || process.env.ACCESS_TOKEN}`,
        },
      };

      return axios.get(url, options);
    })
    .then(r => {
      if (r.status === 200) return r.data;
    })
    .then(data => {
      const graphData = formatDataFromEnedis(data); // [ {metadata, graph_data}, ... ]
      // Save data to database
      graphData.forEach(d => {
        createDataForUser(
          req.user.id,
          d.graph_data,
          d.metadata.unit,
          _.camelCase(URLType),
          d.metadata.usagePointId,
        );
      });
      res.send(graphData);
    })
    .catch(err => {
      if (err.response && err.response.status === 403)
        return res.send({ message: 'Le client est inconnu ou non habilité' });
      console.log(err);
      res.send("Un erreur s'est produit");
    });
};

/**
 * format the data from database to be used by the front end
 *
 * @param {[]object} data {timestamp, value, type, unit, usagePointId}
 */
const formatDataFromDB = data => {
  // { usagePointId: [],  ... }
  const tmp = {};
  data.forEach(e => {
    tmp[e.usagePointId] = tmp[e.usagePointId] || [];
    tmp[e.usagePointId].push({
      timestamp: e.timestamp,
      value: e.value,
    });
  });
  // [{metadata: , data: [] }, ... ]
  const graph_data = Object.keys(tmp).map(id => ({
    metadata: {
      start: data[0].timestamp,
      end: data[data.length - 1].timestamp,
      unit: data[0].unit,
      usagePointId: id,
    },
    graph_data: tmp[id],
  }));
  return graph_data;
};

/**
 * get consumption load curve data
 *
 * @param {*} req
 * @param {*} res
 */
export const getConsumptionLoadCurve = (req, res) => {
  // Is data in bdd
  getDataForUserByType(req.user.id, 'consumptionLoadCurve').then(data => {
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
export const getConsumptionMaxPower = (req, res) => {
  // Is data in bdd
  getDataForUserByType(req.user.id, 'consumptionMaxPower').then(data => {
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
export const getDailyConsumption = (req, res) => {
  // Is data in bdd
  getDataForUserByType(req.user.id, 'dailyConsumption').then(data => {
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
export const getDailyProduction = (req, res) => {
  // Is data in bdd
  getDataForUserByType(req.user.id, 'dailyProduction').then(data => {
    if (data.length === 0) {
      // Data is not in bdd
      getDataFromEnedis('daily_production', req, res);
    } else {
      res.send(formatDataFromDB(data));
    }
  });
};

// datatype needs to be in snake_case
export const refreshData = (req, res, dataType) => {
  getDataFromEnedis(dataType, req, res);
};

export const deleteMyData = (req, res) => {
  return deleteDataForUser(req.user.id)
    .then(affectedRows => {
      res.send('ok');
    })
    .catch(err => {
      console.log(err);
    });
};
