# Improve the Simulation Scheduler Logic to be Dynamic & Human

Currently, the scheduler for the bathroom is limited - normalizing the toilet selection by the user to any available toilet, regardless of the condition it is in. For example, if all toilets are "Horrendous", meaning that they should be used by only 10% of the population, normalizing these toilets essentially yields a simulation where all toilets are treated as equal and thus operating as if they were all clean. The same issue arises when toilets are all configured as Fair & dirty; essentially, normalizing the percentages nullifies the decision of opting out of using the restroom if all toilets are dirty.   The Poolantir simulation is aimed at capturing the human decision using the "Toilet Cleanliness" classifications: 1. Clean (100% of people would use the toilet if open) 2. Fair (75% of people would use the toilet if open)
3. Dirty (50% of people would use the toilet if open)
4. Horrendous (10% of people would use the toilet if open)
5. Out-of-order (0% of people would use the toilet - even if given the chance - as it is too poorly maintained)

## The issue
The current scheduler correctly takes into account all values, however the percentages are normalized such that if 5 clean toilets are used, a 6th horrendous toilet will always be taken. Here is an example configuration to illustrate the point:

|  Toilet # | Toilet Position | Toilet Classification | Anticipated Use Rate |	Expected   |   Actual |
|---------|---------------|---------------------|---------------------- | 
|    1		 |	stall left 			| 	Clean 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 1 |	 In-Use  |   In-Use |
|    2 	 |	stall middle			| 	Clean 			| (P(S.P))*(P(M.T.A.F.C))* 1 |	 In-Use  |   In-Use |
|    3	 |	stall right 			| 	Clean 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 1 |	 In-Use  |   In-Use |
|    4	 |	urinal left 			| 	Clean 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 1 |	 In-Use  |   In-Use |
|    5	 |	urinal middle		| 	Clean 			| (P(S.P))*(P(M.T.A.F.C)) * 1 |	 In-Use  |   In-Use |
|    6	 | 	urinal right 			| 	horrendous 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 0.1 |	User waits for the first open stall that is priority above horrendous |   In-Use |

Here is the flow for how this scheduler should fill the toilets, given that the queue is as follows: {poo, poo, pee, pee, poo, pee}
Users -> Toilet Mapping:
1 (poo) -> stall left
2 (poo) -> stall right
3 (pee) -> sees that the "urinal right" is "horrendous". Thus, he chooses not to go with the middle - as this is proper etiquette, opting for the "urinal left"
4 (pee) urinal middle
5 (poo) -> stall middle
6 (pee) -> does not choose "urinal right" as it is horrendous, waits until user 3 (pee using the "urinal left") finishes, then opts to use the "urinal left"

This is on the premise that 90% of people who are to choose a horrendous toilet when 5 remaining toilets are used will NOT choose the toilet as the condition is horrendous. Rather, a human would exit the bathroom and look for another place to go. Given that this is a urinal however, the user is more likely to wait in the bathroom queue for another urinal to open. Now, consider if the other two pee-ers finish using urinals 1 and 2. Then, there is a 50% chance (applied to the already calculated decision tree calculated. Example-if middle stall remains and is horrendous: ((1-P(S.P))*(P(M.T.A.F.C))/2 * 0.5)) that the waiting user takes urinal 1, and a 50% chance that the user takes urinal 2 which is the middle stall (applied to the already calculated decision tree calculated. Example-if middle stall remains and is horrendous: (P(S.P))*(P(M.T.A.F.C)) * 0.5)). It should compute each of these calculations in succession. If it is the case that the user passes on both the remaining stalls, the user will exit the restroom and be dropped from the queue.  Different reasoning would be applied for if only a horrendous stall is remaining: there is a 10% change that the user chooses the stall, but a 90% chance that they do not take the stall (applied to the already calculated decision tree calculated. Example-if middle stall remains and is horrendous: (1-P(S.P))*(P(M.T.A.F.C))/2 * 0.1)). Humans do not wait until a previous user has completed their poo, so if they do not choose to use the horrendous stall, the user will exit the restroom and be dropped from the queue.

|  Toilet # | Toilet Position | Toilet Classification | Anticipated Use Rate |	Expected   |   Actual |
|---------|---------------|---------------------|---------------------- | 
|    1		 |	stall left 			| 	Clean 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 1 |	 In-Use  |   In-Use |
|    2 	 |	stall middle			| 	Horrendous 			| (P(S.P))*(P(M.T.A.F.C))* 0.1 | Exit the Restroom  |   In-Use |
|    3	 |	stall right 			| 	Clean 			| (1-P(S.P))*(P(M.T.A.F.C))/2 * 1 |	 In-Use  |   In-Use |
(ignoring the urinal calculations as poo-ers cannot use the urinals)


### Handling Middle Toilet as First Choice Rule
The middle stall multiplier will only be applied for the MacLean configuration -where there are three stalls and three urinals. For the Seamen center configuration, as there are only two stalls and two toilets.

Summary of M.T.A.F.C: if it is the case of pooing and all stalls are clean: if one of the outer stall are chose (say left), then the other outer stall (right) will have a 98% chance of being use and the middle a 2%. If the middle stall is the only remaining stall, then it will have a choice of 100% (applied onto toilet cleanliness  classification).

## The Goal 
Each user is processed one-by-one, and human etiquette is to allow the next user in line to take their pick, thus the behavioral model for the simulation will be run on the next user in the queue. If it is the case, they select the toilet given the probabilities, their state will move to "in-use" for the selected toilet. If, by chance, the user is calculated to not choose one of the remaining toilets, they will exit the restroom and be removed from the queue. Then, the next user will be processed.

*Important note: pee-ers in the queue behind the poo-ers in the queue can choose open urinals while poo-ers are still waiting on stalls. If a stall becomes open, however, the priority for competing poo-ers and pee-ers vying for a stall will be given to the poo-er located before the pee-er in the queue. If the pee-er is located before the poo-er in the stall, however, the pee-er will take the stall (given the behavioral model calculates it to be satisfactory for the user)* 

The state of each toilet should be known such that more comprehensive logic can be applied


## Calculation for Choosing Toilet

Product of the following: P(S.P) - probability of shy pee-er configured within Simulation Configuration

Conditional Multipliers:
P(M.T.A.F.C) - probability of choosing the first toilet. Conditional based on the number of same type toilets remaining. 

how M.T.A.F.C changes ex stall

1. M.T.A.F.C Case 1: All remaining
|  Toilet # | Toilet Position |	occupancy			| Toilet Classification | Probability|
|---------|---------------|---------------------|---------------------- |------|
|    1		 |	stall left 	|		open		| 	Clean 			| (P(M.T.A.F.C))/2  *1 |
|    2 	 |	stall middle	|		open		| 	Clean 			| (P(M.T.A.F.C))* 1 | 
|    3	 |	stall right 	|		open		| 	Clean 			| (P(M.T.A.F.C))/2 *1 |	

2. M.T.A.F.C Case 2: Outer and Middle remaining
|  Toilet # | Toilet Position |	occupancy			| Toilet Classification | Probability|
|---------|---------------|---------------------|---------------------- |------|
|    1		 |	stall left 	|		in-use		| 	Clean 			| (0% |
|    2 	 |	stall middle	|		open		| 	Clean 			| 0.02* 1 | 
|    3	 |	stall right 	|		open		| 	Clean 			| 0.98 *1 |	

|  Toilet # | Toilet Position |	occupancy			| Toilet Classification | Probability|
|---------|---------------|---------------------|---------------------- |------|
|    1 	 |	stall left	|		open		| 	Clean 			| 0.02* 1 | 
|    2	 |	stall middle 	|		open		| 	Clean 			| 0.98 *1 |	
|    13	 |	stall right 	|		in-use		| 	Clean 			| 0% |

3. M.T.A.F.C Case 3: Only Middle Remain

|  Toilet # | Toilet Position |	occupancy			| Toilet Classification | Probability|
|---------|---------------|---------------------|---------------------- |------|
|    1 	 |	stall left	|		open		| 	Clean 			| 0% | 
|    2	 |	stall middle 	|		open		| 	Clean 			| 1*1 |	
|    13	 |	stall right 	|		in-use		| 	Clean 			| 0% |