x = rand(5, 3, 5);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(1,end+0:end+0,[3 4 1 5 2]);
y = rand(size(t));
z = x;
z(1,end+0:end+0,[3 4 1 5 2]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
