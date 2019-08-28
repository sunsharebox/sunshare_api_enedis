// import { Data, User } from './index';
const Data = require('./index');

const createDataForUser = (userId, data, unit, type, usagePointId) => {
  const DBdata = data.map(e => ({
    unit,
    timestamp: e.timestamp,
    value: e.value,
    userId,
    type,
    usagePointId,
  }));
  return Data.bulkCreate(DBdata);
};
module.exports = createDataForUser;

const deleteDataForUser = userId => {
  return Data.findAll({ where: { userId } }).then(datas => {
    datas.foreach(d => d.destroy({ force: true }));
  });
  //return Data.destroy({ where: { userId } });
};
module.exports = deleteDataForUser;

const getDataForUserByType = (userId, type) => {
  return Data.findAll({
    where: { userId, type },
    order: [['timestamp', 'DESC']],
  });
};
module.exports = getDataForUserByType;