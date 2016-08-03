x = rand(6, 6);
y = 0;
z = 0;
indexing_error = 0;
try
t = x([2 4 1 5 6],[2 1 3 4 5]);
y = rand;
z = x;
z([2 4 1 5 6],[2 1 3 4 5]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
