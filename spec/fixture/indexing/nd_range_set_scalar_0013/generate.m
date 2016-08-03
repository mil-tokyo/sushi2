x = rand(6, 8, 5);
y = 0;
z = 0;
indexing_error = 0;
try
t = x(6,end-4:3,[3 5 2 1 4]);
y = rand;
z = x;
z(6,end-4:3,[3 5 2 1 4]) = y;
catch
indexing_error = 1;
end
if ~isequal(size(x), size(z))
indexing_error = 1;
end
save('-mat', 'result.mat', 'x', 'y', 'z', 'indexing_error')
