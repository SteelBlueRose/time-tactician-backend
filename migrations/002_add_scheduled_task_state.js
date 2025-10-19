/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addTypeValue('task_state', 'Scheduled');
};

exports.down = pgm => {
  // Not easily reversible
};
