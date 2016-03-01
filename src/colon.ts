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
        if (stop_step == 0) {
          throw new Error('Step cannot be zero');
        }
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
      start += size;
    }
    if (stop < 0) {
      stop += size;
    }

    var jsa: number[] = [];
    if (step > 0) {
      for (var i = start; i <= stop; i += step) {
        jsa.push(i);
      }
    } else {
      for (var i = start; i >= stop; i += step) {
        jsa.push(i);
      }

    }

    return jsa;
  }
}

export = Colon;
