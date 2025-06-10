CREATE TABLE Users (
    user_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type ENUM('Student', 'Mentor', 'Admin') NOT NULL,
    gender ENUM('Male', 'Female') NULL,
    dob DATE NULL,
    graduation_year YEAR NULL,
    image_url LONGBLOB NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_users PRIMARY KEY (user_id)
);

CREATE TABLE Students (
    student_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    bio TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_students PRIMARY KEY (student_id),
    CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Mentors (
    mentor_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    bio TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_mentors PRIMARY KEY (mentor_id),
    CONSTRAINT fk_mentors_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Mentor_Socials (
    social_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    platform ENUM('GitHub', 'LinkedIn', 'Twitter', 'Facebook') NULL,
    url VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_mentor_socials PRIMARY KEY (social_id),
    CONSTRAINT fk_mentor_socials_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);

CREATE TABLE Interests (
    interest_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    interest_name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_interests PRIMARY KEY (interest_id)
);

CREATE TABLE User_Interests (
    user_id CHAR(36) NOT NULL,
    interest_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_user_interests PRIMARY KEY (user_id, interest_id),
    CONSTRAINT fk_user_interests_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_interests_interest FOREIGN KEY (interest_id) REFERENCES Interests(interest_id) ON DELETE CASCADE
);

CREATE TABLE Sessions (
    session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    session_title VARCHAR(100) NOT NULL,
    type ENUM(
        'Course Topic Tuition',
        'Project Help',
        'Career Guidance',
        'Competition Prep',
        'Productivity',
        'ECA',
        'Resume Review',
        'Research Guidance',
        'Mock Interview'
    ) NOT NULL,
    description TEXT NOT NULL,
    duration_mins INT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    is_offline BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_sessions PRIMARY KEY (session_id),
    CONSTRAINT fk_sessions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_duration CHECK (duration_mins > 0),
    CONSTRAINT chk_positive_price CHECK (price >= 0)
);

CREATE TABLE Mentor_Availability (
    availability_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    is_offline BOOLEAN NOT NULL DEFAULT FALSE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    is_booked BOOLEAN DEFAULT FALSE,
    status ENUM('Upcoming', 'Ongoing', 'Completed', 'Cancelled') DEFAULT 'Upcoming' NOT NULL,
    session_id CHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_mentor_availability PRIMARY KEY (availability_id),
    CONSTRAINT fk_mentor_availability_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT fk_mentor_availability_session FOREIGN KEY (session_id) REFERENCES Sessions(session_id) ON DELETE SET NULL
);

CREATE TABLE One_On_One_Sessions (
    one_on_one_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    availability_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    medium ENUM('online', 'offline') NOT NULL,
    -- place VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_one_on_one_sessions PRIMARY KEY (one_on_one_session_id),
    CONSTRAINT fk_one_on_one_sessions_availability FOREIGN KEY (availability_id) REFERENCES Mentor_Availability(availability_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_sessions_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT uq_one_on_one_sessions UNIQUE (availability_id, student_id)
);

CREATE TABLE BookedSessionLinks(
  one_on_one_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
  link VARCHAR(255) NOT NULL,
  CONSTRAINT fk_one_on_one_session_id FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions (one_on_one_session_id) ON DELETE CASCADE
);


CREATE TABLE Group_Sessions (
    group_session_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    session_date TIMESTAMP NOT NULL,
    duration_mins INT NOT NULL,
    max_participants INT NOT NULL,
    platform VARCHAR(255) NULL,
    status ENUM('Upcoming', 'Ongoing', 'Completed', 'Cancelled') DEFAULT 'Upcoming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_group_sessions PRIMARY KEY (group_session_id),
    CONSTRAINT fk_group_sessions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_max_participants CHECK (max_participants > 0)
);

CREATE TABLE Group_Session_Participants (
    group_session_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('registered', 'cancelled', 'completed', 'waiting') DEFAULT 'registered' NOT NULL,
    CONSTRAINT pk_group_session_participants PRIMARY KEY (group_session_id, student_id),
    CONSTRAINT fk_group_session_participants_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_session_participants_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE
);

CREATE TABLE UCOIN_Purchases (
    purchase_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    tk_amount DECIMAL(10, 2) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    payment_method ENUM('Bkash', 'Nagad', 'Bank Card', 'Other', 'Rocket') NOT NULL,
    transaction_reference VARCHAR(100) UNIQUE NOT NULL,
    status ENUM('Pending', 'Completed', 'Failed') DEFAULT 'Pending' NOT NULL,
    phone_number VARCHAR(20) NULL, 
    address VARCHAR(255) NULL,
    CONSTRAINT pk_ucoin_purchases PRIMARY KEY (purchase_id),
    CONSTRAINT fk_ucoin_purchases_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_tk CHECK (tk_amount > 0),
    CONSTRAINT chk_positive_ucoin CHECK (ucoin_amount > 0)
);

CREATE TABLE User_Balances (
    balance_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    ucoin_balance DECIMAL(15, 2) DEFAULT 0.00 NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_user_balances PRIMARY KEY (balance_id),
    CONSTRAINT fk_user_balances_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_balance CHECK (ucoin_balance >= 0)
);

CREATE TABLE Session_Transactions (
    transaction_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    student_id CHAR(36) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status ENUM('Pending', 'Completed', 'Refunded') DEFAULT 'Pending' NOT NULL,
    CONSTRAINT pk_session_transactions PRIMARY KEY (transaction_id),
    CONSTRAINT fk_session_transactions_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_transactions_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_transactions_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE,
    CONSTRAINT chk_positive_transaction_amount CHECK (ucoin_amount > 0)
);

CREATE TABLE Refund_Requests (
    request_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    one_on_one_session_id CHAR(36) NULL,
    student_id CHAR(36) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    ucoin_amount DECIMAL(15, 2) NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_date TIMESTAMP NULL,
    status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending' NOT NULL,
    reason TEXT NULL,
    CONSTRAINT pk_refund_requests PRIMARY KEY (request_id),
    CONSTRAINT fk_refund_requests_session FOREIGN KEY (one_on_one_session_id) 
        REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE SET NULL,
    CONSTRAINT fk_refund_requests_student FOREIGN KEY (student_id) 
        REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_requests_mentor FOREIGN KEY (mentor_id) 
        REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);

CREATE TABLE Posts (
    post_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_posts PRIMARY KEY (post_id),
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Polls (
    poll_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    question TEXT NOT NULL,
    end_time TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_polls PRIMARY KEY (poll_id),
    CONSTRAINT fk_polls_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE
);

CREATE TABLE Poll_Options (
    option_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    poll_id CHAR(36) NOT NULL,
    option_text VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_poll_options PRIMARY KEY (option_id),
    CONSTRAINT fk_poll_options_poll FOREIGN KEY (poll_id) REFERENCES Polls(poll_id) ON DELETE CASCADE
);

CREATE TABLE Poll_Votes (
    vote_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    poll_id CHAR(36) NOT NULL,
    option_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_poll_votes PRIMARY KEY (vote_id),
    CONSTRAINT fk_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES Polls(poll_id) ON DELETE CASCADE,
    CONSTRAINT fk_poll_votes_option FOREIGN KEY (option_id) REFERENCES Poll_Options(option_id) ON DELETE CASCADE,
    CONSTRAINT fk_poll_votes_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT uq_poll_votes_user_poll UNIQUE (user_id, poll_id)
);

CREATE TABLE Hashtags (
    hashtag_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    hashtag_name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_hashtags PRIMARY KEY (hashtag_id)
);

CREATE TABLE Content_Hashtags (
    content_type ENUM('Post', 'Poll') NOT NULL,
    content_id CHAR(36) NOT NULL,
    hashtag_id CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_content_hashtags PRIMARY KEY (content_type, content_id, hashtag_id),
    CONSTRAINT fk_content_hashtags_hashtag FOREIGN KEY (hashtag_id) REFERENCES Hashtags(hashtag_id) ON DELETE CASCADE
);

CREATE TABLE Comments (
    comment_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    post_id CHAR(36) NULL,
    parent_comment_id CHAR(36) NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_comments PRIMARY KEY (comment_id),
    CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE,
    CONSTRAINT fk_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES Comments(comment_id) ON DELETE CASCADE,
    CONSTRAINT chk_parent_comment_logic CHECK (
        (parent_comment_id IS NULL AND post_id IS NOT NULL)
        OR
        (parent_comment_id IS NOT NULL AND post_id IS NULL)
    )
);

CREATE TABLE Reactions (
    reaction_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    user_id CHAR(36) NOT NULL,
    post_id CHAR(36) NULL,
    comment_id CHAR(36) NULL,
    reaction_type ENUM('Love') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_reactions PRIMARY KEY (reaction_id),
    CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_reactions_post FOREIGN KEY (post_id) REFERENCES Posts(post_id) ON DELETE CASCADE,
    CONSTRAINT fk_reactions_comment FOREIGN KEY (comment_id) REFERENCES Comments(comment_id) ON DELETE CASCADE,
    CONSTRAINT chk_post_or_comment CHECK (post_id IS NOT NULL XOR comment_id IS NOT NULL),
    CONSTRAINT uq_reaction_user_post UNIQUE (user_id, post_id),
    CONSTRAINT uq_reaction_user_comment UNIQUE (user_id, comment_id)
);


-------------------------------------------------------------------------------------------------

CREATE TABLE Reviews (
    review_id CHAR(36) DEFAULT (UUID()) NOT NULL,
    student_id CHAR(36) NOT NULL,
    mentor_id CHAR(36) NOT NULL,
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT pk_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_reviews_student FOREIGN KEY (student_id) REFERENCES Students(student_id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_mentor FOREIGN KEY (mentor_id) REFERENCES Mentors(mentor_id) ON DELETE CASCADE
);

CREATE TABLE One_On_One_Reviews (
    review_id CHAR(36) NOT NULL,
    one_on_one_session_id CHAR(36) NOT NULL,
    CONSTRAINT pk_one_on_one_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_one_on_one_reviews_review FOREIGN KEY (review_id) REFERENCES Reviews(review_id) ON DELETE CASCADE,
    CONSTRAINT fk_one_on_one_reviews_session FOREIGN KEY (one_on_one_session_id) REFERENCES One_On_One_Sessions(one_on_one_session_id) ON DELETE CASCADE
);

CREATE TABLE Group_Session_Reviews (
    review_id CHAR(36) NOT NULL,
    group_session_id CHAR(36) NOT NULL,
    CONSTRAINT pk_group_session_reviews PRIMARY KEY (review_id),
    CONSTRAINT fk_group_session_reviews_review FOREIGN KEY (review_id) REFERENCES Reviews(review_id) ON DELETE CASCADE,
    CONSTRAINT fk_group_session_reviews_session FOREIGN KEY (group_session_id) REFERENCES Group_Sessions(group_session_id) ON DELETE CASCADE
);

-------------------------------------------------------------------------------------------------
