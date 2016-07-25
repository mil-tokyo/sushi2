x = rand(8, 4, 4);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(8:end-4,end-4:-3:end-5);
y = rand(size(t));
z = x;
z(8:end-4,end-4:-3:end-5) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
