x = rand(4, 4, 1);
y = 0;
z = 0;
indexing_error = 0;
try
t = x([2 4 1 3],[3 2 4 1]);
y = rand(size(t));
z = x;
z([2 4 1 3],[3 2 4 1]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
