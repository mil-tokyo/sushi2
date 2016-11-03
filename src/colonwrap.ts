// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
import Colon = require('./colon');

function colon(start?: number, stop_step?: number, stop?: number): Colon {
  return new Colon(start, stop_step, stop);
}

namespace colon {
  export var s = Colon.fromstring;
}

export = colon;
