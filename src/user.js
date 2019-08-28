import axios from 'axios';
import { getUserByEnedisId, findOrCreateUser } from '../db/user';
import { deleteDataForUser } from '../db/data';

/**
 * get user's accestoken
 *
 * if the token is expired, get a new one through enedis.
 * @param {number} id enedis user id
 */
export const getUserAccessToken = id => {
  return getUserByEnedisId(id).then(user => {
    if (user) {
      if (user.expiredAt < new Date()) {
        // TODO get new accessToken
      }
      console.log('user accessToken : ', user.accessToken);
      return user.accessToken;
    }
    throw new Error('User not found');
  });
};

/**
 * get user information from enedis
 *
 * @param {string} accessToken
 * @param {number} usagePointId
 */
export const getUserFromEnedis = (accessToken, usagePointId) => {
  const url = `https://gw.hml.api.enedis.fr/v3/customers/identity?usage_point_id=${usagePointId}`;
  const options = {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  // data is in the form of [{"customer": { "customer_id": "3000000", "identity": {"natural_person": {title, firstname, lastname} } } } ]
  return axios.get(url, options).then(res => res.data[0].customer);
};

/**
 * get user's contact data from enedis
 *
 * @param {string} accessToken
 * @param {number} usagePointId
 */
export const getUserContactDataFromEnedis = (accessToken, usagePointId) => {
  const url = `https://gw.hml.api.enedis.fr/v3/customers/contact_data?usage_point_id=${usagePointId}`;
  const options = {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  /* data is in the form of 
  {
    "customer_id": "1358019319",
      "contact": {
      "phone": "0245323491",
      "email": "sandra.thi@wanadoo.fr"
    }
  }
  */
  return axios.get(url, options).then(res => res.data[0].customer);
};

/**
 * get user's contract data from enedis
 *
 * @param {string} accessToken
 * @param {number} usagePointId
 */
export const getUserContractsFromEnedis = (accessToken, usagePointId) => {
  const url = `https://gw.hml.api.enedis.fr/v3/customers/usage_points/contracts?usage_point_id=${usagePointId}`;
  const options = {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  /* data is in the form of (there's always the extra customer: [ { <data shown below> } ])
    {
      "customer_id": "1358019319",
      "usage_points": [
        {
          "usage_point": {
            "usage_point_id": "12345678901234",
            "usage_point_status": "com",
            "meter_type": "AMM",
            "contracts": {
              "segment": "C5",
              "subscribed_power": "9",
              "last_activation_date": "2013-08-14+01:00",
              "distribution_tariff": "BTINFCUST",
              "last_distribution_tariff_change_date": "2017-12-25+01:00",
              "offpeak_hours": "23h-7h",
              "contract_type": "CARD-S",
              "contract_status": "SERVC"
            }
          }
        }
      ]
    }
  */

  return axios.get(url, options).then(res => res.data[0].customer);
};

/**
 * get user's address from enedis
 *
 * @param {string} accessToken
 * @param {number} usagePointId
 */
export const getUserAddressesFromEnedis = (accessToken, usagePointId) => {
  const url = `https://gw.hml.api.enedis.fr/v3/customers/usage_points/addresses?usage_point_id=${usagePointId}`;
  const options = {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
  /* 
  {
  "customer_id": "1358019319",
  "usage_points": [
    {
      "usage_point": {
        "usage_point_id": "12345678901234",
        "usage_point_status": "com",
        "usage_point_address": {
          "street": "2 bis rue du capitaine Flam",
          "locality": "lieudit Tourtouze",
          "postal_code": "32400",
          "insee_code": "32244",
          "city": "Maulichères",
          "country": "France",
          "geo_points": {
            "latitude": "43.687253",
            "longitude": "-0.087957",
            "altitude": "148"
          }
        }
      }
    }
  ]
  }
  */

  return axios.get(url, options).then(res => res.data[0].customer);
};

/**
 * format address into human readable form
 *
 * @param {object} address
 */
const formatAddress = address => {
  const { street, postal_code, city, country } = address;
  return `${street} \n ${city} ${postal_code} \n ${country}`;
};

/**
 * get all user's data from enedis and format them for the frontend
 *
 * @param {object} req
 * @param {object} res
 */
export const getMyData = (req, res) => {
  const user = req.user; // {id, usagePointId }
  return getUserAccessToken(user.id)
    .then(accessToken => {
      const contactData = getUserContactDataFromEnedis(accessToken, user.usagePointId);
      const identity = getUserFromEnedis(accessToken, user.usagePointId);
      const contracts = getUserContractsFromEnedis(accessToken, user.usagePointId);
      const addresses = getUserAddressesFromEnedis(accessToken, user.usagePointId);
      return Promise.all([contactData, identity, contracts, addresses]);
    })
    .then(data => {
      if (data.length == 4) {
        // TODO verify data structure
        const customer = {
          firstname: data[1].identity.natural_person.firstname,
          lastname: data[1].identity.natural_person.lastname,
          phone: data[0].contact_data.phone,
          email: data[0].contact_data.email,
          contracts: data[2].usage_points,
          addresses: data[3].usage_points.map(up =>
            formatAddress(up.usage_point.usage_point_addresses),
          ),
        };
        console.log(customer);
        res.send(customer);
      } else {
        throw new Error('Incorrect data received');
      }
    })
    .catch(err => console.log(err));
};

export const deleteMyData = (req, res) => {
  const userId = req.user.id;
  deleteDataForUser;
};
