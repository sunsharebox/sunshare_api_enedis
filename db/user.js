// import { User } from './index';
const User = require('./index');

const getUserByEnedisId = enedisId => {
  return User.findById(enedisId);
};
module.exports = getUserByEnedisId;

const findOrCreateUser = (
  firstname,
  lastname,
  enedisId,
  accessToken,
  refreshToken,
  usagePointId,
  expiresAt,
) => {
  return User.findOrCreate({
    where: { id: enedisId },
    defaults: {
      firstname,
      lastname,
      accessToken,
      refreshToken,
      expiresAt,
      usagePointId,
    },
  });
};
module.exports = findOrCreateUser;

const updateUser = (user, newData) => {
  const { firstname, lastname, accessToken, usagePointId } = newData;
  return user.update({ accessToken, firstname, lastname, usagePointId });
};
module.exports = updateUser;
