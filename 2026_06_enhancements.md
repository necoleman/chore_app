# List of enhancements and bugfixes

Rev. 2026-06-28
App version 0.2.0

## Issue log

This is a list of issues not covered in the previous test plan. The 
ID | Platform | Permissions level | Browser | Issue | Resolution
-|-|-|-|-|-
1 | iOS | Admin | Safari | After "Add" is clicked, the menu modal at the bottom of the screen obscures the "Cancel" and "Save" buttons. This is not an issue in Android (Vivaldi browser). | Resolved (v0.1.2) — modals now render via a portal at `<body>`, escaping the scroll container that clipped them on iOS
2 | iOS | Admin | Safari | When opening from the home screen, text and buttons at the top of the page are obscured by the iphone status such as battery, making it impossible to click "Add". This is not an issue in Android (Vivaldi browser) | Resolved (v0.1.2) — added `env(safe-area-inset-top)` padding to the app shell
3 | iOS | Admin | Safari | If you click the three dots to view the options on a chore and then click out of the three dots it marks the chore as complete. This shouldn't happen. Ideally, a chore should be marked as complete only if checking the circle where the check will go - not the chore name or anywhere on the chore other than that circle. |
4 | iOS | Admin | Safari | Clicking "move date" or "reassign" in the three dot drop down does not give you the date screen or reassign screen when you click on them for a chore assigned to me - it only works if I click on them for a chore assigned to someone else. Needs fixing! | 
5 | iOS | Admin/User | Safari | When admin approves or does not approve a chore marked as complete by a child user, they are allowed to add a comment if marking to send the chore back - however, it does not appear that that comment is then displayed to the child user. The child user should have the chore unchecked in their bucket again (as currently happens) but should also see the feedback. Maybe the chore should have on it text like (example is for clean bathroom task): Chore sent back by admin user: The floor is still dirty, please reclean it. Everything else is fine. | 
6 | iOS | Admin | Safari | Figure out what "Did it" means on the Chores screen - seems to mean nothing. I think it's not necessary. I think just having edit is ok. | 


## Enhancements

Here is a list of proposed enhancements:

| Status | ID | Enhancement |
|-|-|-|
| ✅ Done (v0.1.2) | 2 | Have a "Chore Location" category feature that shows up on the chore - this way there can be multple chores with the name Vacuum and each can have a category (kitchen, living room, etc) - only need one location per chore. Chores can then also be sorted and organized by category. *(Location dropdown fed by `Locations` sheet tab; shown on chore rows and Today cards; searchable. Sorting/grouping by category not yet added.)* |
| ✅ Done (v0.1.2) | 3 | Have a "Description" column where Admins can enter more information about what the chore involves (additional granularity) - for example, this way the chore "clean bedroom" can have notes in it saying "this means sweep, make surfaces orderly, make bed, clear floor, and vacuum |
| ✅ Done (v0.1.2) | 4 | Have the ability to search the full chore list, so that if I go through the closet on the landing and reorganize it even if it wasn't assigned, I can check whether it exists and mark that I did it and change the frequency if I feel it needs changing, or if I don't find it in the list I can then add it as a chore (but this way I don't add it twice). *(Search matches name/location/description/assignee/"Unclaimed"; "✓ Did it" logs an ad-hoc done with no points/credit; Edit changes frequency; add-from-search when no match.)* |
| ✅ Done (v0.2.0) | 5 | When a chore is approved (or is done and does not require approval), it goes to the bottom of the day's chore list and is grayed out there. More precisely, the chores are sorted so that all open/unapproved chores are above all closed/approved chores. Also make chores pending approval a different color (eg amber) *(Finished chores sort to the bottom; among unfinished, overdue first. Pending shows amber; the assignee now sees their own pending as a "Waiting for review" card.)* |
| ✅ Done (v0.2.0) | 6 | Uncheck a chore, in case you realize you checked it by mistake. Make sure that an unchecked chore has a confirmation. Approved chores cannot be unchecked. (Unchecked chores should also move back up.) *("Undo" button → confirmation modal; reverts to open, removes awarded points (clamped ≥0), moves back up. Approved chores (reviewed_by set) have no Undo and are blocked server-side.)* |
| ✅ Done (v0.2.0) | 7 | Keep overdue chores from previous days on the "Today" tab flagged as overdue until they're either resolved or bumped by an admin *(Unfinished items of any age stay on Today with an "Overdue · MM-DD" badge, sorted to the top; cleared by completing, bumping, or skipping. No age cutoff.)* |
| ✅ Done (v0.2.0) | 8 | Handle one-time tasks (for example, moving furniture in/out). It's fine to update the data model for this. *(New `once` frequency + `once_date` column; generates a single assignment on/after the date, then auto-archives the chore (active=FALSE). Form has a "One-time" option + date picker.)* |
| ⬜ Open | 9 | When adding a new task as Monthly or Every N Days, there should be a way to set "first due date" - for a new task, it should decay or to today's date but should be editable. In general, tasks should have a "next due" and " last done" field. For non weekly daily tasks it could make sense to have "next due" listed so it is shown alongside assignee and location, without having to click on the task. |
| Open | 10 | In the Chores screen (but NOT in the Today screen), you should be able to see when the next date the chore will be due, except for daily chores (which should not display a date due). Maybe: Weekly chores or chores that are scheduled to occur several specific days of the week should either say "Today" if they are due today or the name of the weekday they are next due (i.e. Tuesday) rather than the date. |
| Open | 11 |In the Chores screen, you should be able to see the first line of the description of the chore, with a little button that opens the rest of the description so you can see the full thing, and a button to minimize it again. This should probably also be the case on the Today screen, although we need to be careful that the description doesn't clutter things up too much. Maybe it's just a button with a carrot at the bottom of each chore that says "Description" and if you hit the carrot it opens, and hten you hit a minimize carrot to close it again? |


## Bugs 

### (20260627 T0)

Testing round T0 is under way. Below will be a list of failed test cases.