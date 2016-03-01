import Colon = require('./colon');

function colon(start?: number, stop_step?: number, stop?: number): Colon {
  return new Colon(start, stop_step, stop);
}

namespace colon {
  export var s = Colon.fromstring;
}

export = colon;
