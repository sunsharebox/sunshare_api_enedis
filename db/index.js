// get an instance of mongoose and mongoose.Schema
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * Defines the user schema in the database
 */
let User = new Schema({
    usagePointId: String,
    firstname: String,
    lastname: String,
    id: { type: String, primaryKey: true },
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,
});
module.exports = mongoose.model('user', User);

/**
 * Defines the data schema in the database
 * type: ConsumptionLoadCurve, ConsumptionMaxPower, DailyConsumption, DailyProduction
 */
let Data = new Schema({
  type: String,
  timestamp: Date,
  value: Number,
  unit: String,
  usagePointId: String,
});
module.exports = mongoose.model('data', Data)
