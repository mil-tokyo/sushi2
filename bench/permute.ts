import $M = require('../src/sushi');
import BenchBase = require('./bench_base');

class permute extends BenchBase {
  constructor(public shape: number[], public order: number[]) {
    super();
    this.name = "permute ([" + shape + "], [" + order + "])";
  }

  setup() {
    var a = $M.zeros(...this.shape, 'gpuArray');
    return [a];
  }

  run(a: $M.Matrix): void {
    $M.permute(a, this.order);
  }
}

export = permute;
