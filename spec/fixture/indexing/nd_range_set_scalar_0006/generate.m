x = rand(9, 5);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(end-4:0:end-8,[3 4 2 1 5],1);
y = rand;
z = x;
z(end-4:0:end-8,[3 4 2 1 5],1) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
