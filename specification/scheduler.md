# Real-Time Scheduler

*Idea:*
Similar to how real restrooms work, users will enter the restroom, assess the toilet state (open/used/almost open/out of order) and choose the first open toilet which satisfies their use type (1: pee, 2: poo :) ).
In real life, this is a FIFO queue (assumming human decency), where the next in line may choose the toilet of their need before following users in the queue. To account for a user resorting to a toilet of less cleanliness, I have factored in some percent chances for a user to select an open toilet given its classification. 

## Assumptions (configurable within Simulation Confirguration sidebar square component)
1. if three urinals are avaible, the 1st will have a 46% usage rate, the 2nd (middle) a 2% usaqe rage, and the 3rd a 46% usage rate
2. if three stalls are avaible, the 1st will have a 46% usage rate, the 2nd (middle) a 2% usaqe rage, and the 3rd a 46% usage rate
3. Shy pissers will choose the toilets 2% of the time, at which the assumption 2 will take effect.
4. if the 1st urinal is taken, then the 2nd (middle) will be chosen 2% of the time, and the 3rd 98% of the time
5. if the 1st toilet is taken, then the 2nd (middle) will be chosen 2% of the time, and the 3rd 98% of the time
6. if two urinals are taken (regardless of 1st, 2nd, 3rd), the remaining urinal will be taken
7. if two toilets are taken (regardless of 1st, 2nd, 3rd), the remaining toilet will be taken

The assumptions can be dynamically adjusted by the user through the Simulation Configuration sidebar square.
There will be options for percent usage for first/second/third toilet for both urinals and stalls and shy pisser percentage.

## Cases
Case 1: empty queue and new pee
- This case takes into account that a user can go pee in any of the available urinals and any of the available toilets
- Apply assumptions 1 and 3 to scheduler

Case 2: empty queue and new poo
- apply assumption 2

Other 214 cases:
- apply the shy pisser assumption (assumption 3) and assumptions 4,5,6, and 7