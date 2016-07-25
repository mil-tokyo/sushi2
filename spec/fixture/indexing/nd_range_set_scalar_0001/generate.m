x = rand(5, 3);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(end-2:4,end+0:-1:end+0);
y = rand;
z = x;
z(end-2:4,end+0:-1:end+0) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
