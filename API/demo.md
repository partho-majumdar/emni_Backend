Here's a list of all the endpoints from the provided API documentation:

### A. 1:1 Sessions
1. `GET api/sessions/{sessionId}` - Get session by session ID
2. `GET api/sessions/mentor` - Get sessions list for a particular mentor
3. `POST api/sessions/new` - Create new session
4. `PUT api/sessions/{sessionId}` - Update session (implied from context)
5. `DELETE api/sessions/{sessionId}` - Delete session (implied from context)
6. `GET api/sessions/student/interest` - Get session list for student (interest-based)
7. `GET api/sessions/student/others` - Get session list for student (others)
8. `GET api/student/findmentor/interest` - Student find mentor based on interest

### B. Student
1. `GET api/student/booked/{studentID}` - Get booked sessions of a student
2. `POST api/student/payment/{sessionID}` - Book a session (payment request)
3. `GET api/student/booked/closest?t={ISOString}` - Get closest booked session to a time

### C. Mentor
1. `POST api/mentor/availability/add` - Add availability
2. `GET api/mentor/availability/` - Get mentor availability list
3. `GET api/mentor/booked/closest?t={ISOString}` - Get closest booked session to a time

### D. Group Sessions
1. `GET api/groupsessions/` - Get list of group sessions
2. `GET api/groupsessions/{gsid}` - Get specific group session information
3. `POST api/groupsessions/join` - Student joins a group session
4. `POST api/groupsessions/cancelregistration` - Participant cancel registration
5. `GET api/groupsessions/participantlist/{gsid}` - Get list of registered participants
6. `POST api/groupsessions/create` - Create group session
7. `DELETE api/groupsessions/delete/{groupSessionId}` - Delete group session
8. `GET api/groupsessions/mentor/{mID}` - Get list of group sessions for a mentor
