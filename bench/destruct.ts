import $M = require('../src/sushi');
import BenchBase = require('./bench_base');

class destruct extends BenchBase {
  mats: $M.Matrix[];
  constructor(public m: number) {
    super();
    this.name = "destruct " + m;
  }

  setup() {
    this.mats = [];
    for (var i = 0; i < 10; i++) {
      this.mats.push($M.gpuArray($M.rand(this.m, 1)));
    }
    return [];
  }

  run(): void {
    var mat = this.mats.pop();
    mat.destruct();
  }
}

export = destruct;
