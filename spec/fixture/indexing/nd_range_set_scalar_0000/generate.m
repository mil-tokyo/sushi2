x = rand(6, 7);
y = 0;
z = 0;
indexing_error = 0;
try
t = x([1 4 2 2 1],[1 2 4 5 4]);
y = rand;
z = x;
z([1 4 2 2 1],[1 2 4 5 4]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
