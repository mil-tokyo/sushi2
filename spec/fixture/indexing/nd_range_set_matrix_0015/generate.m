x = rand(9, 2, 6);
y = 0;
z = 0;
indexing_error = 0;
try
t = x([5 6 2 1 7],[12 5 10 3 11]);
y = rand(size(t));
z = x;
z([5 6 2 1 7],[12 5 10 3 11]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
