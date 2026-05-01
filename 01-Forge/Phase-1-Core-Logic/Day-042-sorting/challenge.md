# Anomaly Report: Day 042

## The Anomaly to Test
**Custom Sorting Logic:** Can you sort a list of numbers based on their absolute distance from zero?

## Execution Steps
1. Create a slice `[]int{-10, 5, -2, 20}`.
2. Use `sort.Slice` and provide a custom `less` function using `math.Abs`.
3. Print the results.

## The Fintech Lesson
Sometimes we don't want the "Natural" order. Altradits might need to sort transactions by "Risk Level" or "Priority" rather than just amount. Learning `sort.Slice` gives you the power to define what "Order" means for your specific business.