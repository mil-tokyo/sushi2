#!/usr/bin/env python

# generates random test case for matrix indexing

import sys,os
import numpy as np
import subprocess
import tempfile
import scipy.io
import shutil

STR_SUSHI = False

class EndOffset:
    def __init__(self, offset):
        # offset = -5 => "end-5"
        self.offset = offset
    
    def __str__(self):
        if STR_SUSHI:
            return "$M.end{:+}".format(self.offset)
        else:
            return "end{:+}".format(self.offset)

class Colon:
    def __init__(self, start, step, end):
        self.start = start
        self.step = step
        self.end = end
    
    def __str__(self):
        if STR_SUSHI:
            if self.start is None:
                return "$M.colon()"
            elif self.step is not None:
                return "$M.colon({0},{1},{2})".format(self.start, self.step, self.end)
            else:
                return "$M.colon({0},{1})".format(self.start, self.end)
        else:
            if self.start is None:
                return ":"
            elif self.step is not None:
                return "{0}:{1}:{2}".format(self.start, self.step, self.end)
            else:
                return "{0}:{1}".format(self.start, self.end)

class Matrix:
    def __init__(self, array):
        self.array = array#numpy array
    
    def __str__(self):
        if STR_SUSHI:
            return "$M.jsa2mat({}, false, 'int32')".format(self.array.tolist())
        else:
            if self.array.ndim == 1:
                return "[{}]".format(" ".join(map(str, self.array.tolist())))
            elif self.array.ndim == 2:
                rows_str = [" ".join(map(str, row)) for row in self.array.tolist()]
                return "[{}]".format(";".join(rows_str))
            else:
                raise ValueError('ndim > 2')

def randint_noisy(low, high):
    if np.random.random() < 0.01:
        # generate out of range
        if np.random.random() < 0.5:
            return low - 1
        else:
            return high
    else:
        return np.random.randint(low, high)#[low, high)

def generate_get_octave_script(x_shape, indexer):
    STR_SUSHI = False
    commands = []
    commands.append("x = rand{};".format(tuple(x_shape)))#rand(2,3)
    commands.append("y = 0;")
    commands.append("z = 0;")
    commands.append("indexing_error = 0;")
    commands.append("try")
    commands.append("y = x({});".format(",".join(map(str, indexer))))
    commands.append("catch")
    commands.append("indexing_error = 1;")
    commands.append("end")
    commands.append("save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')")
    commands.append("")
    return "\n".join(commands)

def generate_set_octave_script(x_shape, indexer, set_scalar):
    global STR_SUSHI
    STR_SUSHI = False
    commands = []
    commands.append("x = rand{};".format(tuple(x_shape)))#rand(2,3)
    commands.append("y = 0;")
    commands.append("indexing_error = 0;")
    commands.append("try")
    commands.append("t = x({});".format(",".join(map(str, indexer))))# get shape of indexed area
    if set_scalar:
        commands.append("y = rand;")
    else:
        commands.append("y = rand(size(t));")
    commands.append("z = x;")
    commands.append("z({}) = y;".format(",".join(map(str, indexer))))
    commands.append("catch")
    commands.append("indexing_error = 1;")
    commands.append("end")
    commands.append("save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')")
    commands.append("")
    return "\n".join(commands)

def execute_octave(commands):
    tmpdir = tempfile.mkdtemp()
    script_path = tmpdir + "/script.m"
    with open(script_path, "w") as f:
        f.write(commands)
    subprocess.check_call(["octave", script_path, "--no-gui"], cwd = tmpdir)
    result_mat = scipy.io.loadmat(tmpdir + "/result.mat")
    shutil.rmtree(tmpdir)
    return result_mat

def generate_get_expect_js(x_shape, indexer):
    global STR_SUSHI
    STR_SUSHI = True
    commands = []
    indexer_str = ",".join(map(str, indexer))
    commands.append("if (indexing_error.get() > 0) {{expect(() => x.get({0})).toThrow();}} else {{var t = x.get({0}); expect($M.isequal(t, y)).toBeTruthy();}}".format(indexer_str))
    return "\n".join(commands)

def generate_set_expect_js(x_shape, indexer):
    global STR_SUSHI
    STR_SUSHI = True
    commands = []
    indexer_str = ",".join(map(str, indexer))
    commands.append("if (indexing_error.get() > 0) {{expect(() => x.set({0}, y)).toThrow();}} else {{x.set({0}, y); expect($M.isequal(x, z)).toBeTruthy();}}".format(indexer_str))
    return "\n".join(commands)

def save_case(name, result_mat, expect_js):
    output_dir = "fixture/indexing/" + name
    if os.path.exists(output_dir):
        print("{} exists; passing")
        return
    os.mkdir(output_dir)
    for key in ["x", "y", "z", "indexing_error"]:
        np.save("{}/{}.npy".format(output_dir, key), result_mat[key])
    with open("{}/expect.js".format(output_dir), "w") as f:
        f.write(expect_js)


def make_get_linear_index():
    x_shape = (10, 20)
    indexer = [3, Colon(10, None, 12)]
    octave_commands = generate_get_octave_script(x_shape, indexer)
    result_mat = execute_octave(octave_commands)
    js_commands = generate_get_expect_js(x_shape, indexer)
    save_case("colon", result_mat, js_commands)

def make_case(name, x_shape, indexer, is_set, set_scalar):
    if is_set:
        octave_commands = generate_set_octave_script(x_shape, indexer, set_scalar)
        js_commands = generate_set_expect_js(x_shape, indexer)
    else:
        octave_commands = generate_get_octave_script(x_shape, indexer)
        js_commands = generate_get_expect_js(x_shape, indexer)
    result_mat = execute_octave(octave_commands)
    save_case(name, result_mat, js_commands)

make_case("get_colon", (10, 20), [3, Colon(10, None, 12)], False, False)
make_case("set_colon", (10, 20), [3, Colon(10, None, 12)], True, False)
make_case("set_scalar_colon", (10, 20), [3, Colon(10, None, 12)], True, True)
make_case("get_colon_ex", (10, 20), [3, Colon(10, None, 25)], False, False)

