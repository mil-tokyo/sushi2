// (c) 2016 Machine Intelligence Laboratory (The University of Tokyo), MIT License.
// colon object
// $M.colon(1,3,10) or $M.colon.fromstring('1:3:10');

class Colon {
  // http://jp.mathworks.com/help/matlab/ref/colon.html
  start: number;
  stop: number;
  step: number;
  all: boolean;//means ':'
  constructor(start?: number, stop_step?: number, stop?: number) {
    this.start = start;
    this.step = 1;
    if (this.start == null) {
      this.all = true;
    } else {
      if (stop != null) {
        // start:step:stop
        this.step = stop_step;
        this.stop = stop;
      } else {
        // start:1:stop
        this.stop = stop_step;
      }
    }
  }

  static fromstring(s: string): Colon {
    var elements = s.replace('end', '-1').split(':');
    var nums: number[] = [];
    for (var i = 0; i < elements.length; i++) {
      nums.push(eval(elements[i] || 'null'));
    }

    if (elements.length == 2) {
      return new Colon(nums[0], nums[1]);
    } else if (elements.length == 3) {
      return new Colon(nums[0], nums[1], nums[2]);
    } else {
      throw new Error('Invalid format');
    }
  }

  tojsa(size?: number): number[] {
    var start = this.start;
    var stop = this.stop;
    var step = this.step;
    if (this.all) {
      start = 1;
      stop = size;
      step = 1;
    }
    if (start < 0) {
      start += size + 1;
    }
    if (stop < 0) {
      stop += size + 1;
    }

    var jsa: number[] = [];
    if (step > 0) {
      for (var i = start; i <= stop; i += step) {
        jsa.push(i);
      }
    } else if (step < 0) {
      for (var i = start; i >= stop; i += step) {
        jsa.push(i);
      }
    }//step == 0 means length 0

    return jsa;
  }

  toString(): string {
    if (this.start == null) {
      return ':';
    } else {
      if (this.step == null) {
        return colonedge2str(this.start) + ':' + colonedge2str(this.stop);
      } else {
        return colonedge2str(this.start) + ':' + this.step + ':' + colonedge2str(this.stop);
      }
    }
  }
}

function colonedge2str(val: number): string {
  if (val >= 0) {
    return '' + val;
  } else {
    if (val == 0) {
      return 'end';
    }
    return 'end-' + (-1 - val);
  }
}

export = Colon;
