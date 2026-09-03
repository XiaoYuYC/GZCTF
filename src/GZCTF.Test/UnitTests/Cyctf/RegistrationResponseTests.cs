using System;
using System.Text.Json;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Response.Cyctf;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public class RegistrationResponseTests
{
    [Fact]
    public void FromEntity_UsesStoredTeamNameWithoutRelatedTeam()
    {
        var registration = new Registration
        {
            Id = 1,
            GameId = 1,
            DivisionId = 1,
            TeamName = "Email Registration Team"
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.Null(response.TeamId);
        Assert.Equal("Email Registration Team", response.TeamName);
    }

    [Fact]
    public void FromEntity_FallsBackToRelatedTeamNameWhenStoredNameIsMissing()
    {
        var registration = new Registration
        {
            Id = 2,
            GameId = 1,
            DivisionId = 1,
            TeamId = 7,
            Team = new Team { Id = 7, Name = "Authenticated Registration Team" }
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.Equal(7, response.TeamId);
        Assert.Equal("Authenticated Registration Team", response.TeamName);
    }

    [Fact]
    public void AdminResponse_PreservesCompleteRegistrationDetails()
    {
        var registration = new Registration
        {
            Id = 3,
            GameId = 9,
            DivisionId = 4,
            TeamName = "Admin Team",
            TeamBio = "Admin Team Bio",
            CaptainEmail = "captain@example.com",
            FormData = "{\"school\":\"Example University\"}",
            Status = "PENDING",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Accepted,
                    MemberFields = "{\"grade\":3}",
                    SentAt = DateTimeOffset.UtcNow
                }
            })
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.Equal("Admin Team", response.TeamName);
        Assert.Equal("Admin Team Bio", response.TeamBio);
        Assert.Equal("captain@example.com", response.CaptainEmail);
        Assert.Equal("{\"school\":\"Example University\"}", response.FormData);
        var member = Assert.Single(response.Members);
        Assert.Equal("member@example.com", member.Email);
        Assert.Equal(InvitationStatus.Accepted, member.Status);
        Assert.Equal("{\"grade\":3}", member.MemberFields);
    }

    [Fact]
    public void AllMembersAccepted_SingleCaptainRegistration_IsTrue()
    {
        var registration = new Registration
        {
            Id = 4,
            GameId = 9,
            DivisionId = 4,
            CaptainEmail = "captain@example.com",
            Status = "PENDING",
            TeamId = null,
            MemberInvitations = null
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.True(response.AllMembersAccepted);
        Assert.Equal(1, response.TeamSize);
    }

    [Fact]
    public void TeamSize_IncludesCaptainAndInvitedMembers()
    {
        var registration = new Registration
        {
            Id = 7,
            GameId = 9,
            DivisionId = 4,
            CaptainEmail = "captain@example.com",
            Status = "PENDING",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation { Email = "member1@example.com", Status = InvitationStatus.Pending },
                new MemberInvitation { Email = "member2@example.com", Status = InvitationStatus.Accepted }
            })
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.Equal(3, response.TeamSize);
    }

    [Fact]
    public void TeamSize_UsesActualRelatedTeamMembers()
    {
        var captain = new UserInfo { Id = Guid.NewGuid() };
        var member = new UserInfo { Id = Guid.NewGuid() };
        var team = new Team { Id = 8, Captain = captain };
        team.Members.Add(captain);
        team.Members.Add(member);
        var registration = new Registration
        {
            Id = 8,
            GameId = 9,
            DivisionId = 4,
            TeamId = team.Id,
            Status = "APPROVED",
            Team = team
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.Equal(2, response.TeamSize);
    }

    [Fact]
    public void AllMembersAccepted_IncludesCaptainAndAcceptedInvitations()
    {
        var registration = new Registration
        {
            Id = 5,
            GameId = 9,
            DivisionId = 4,
            CaptainEmail = "captain@example.com",
            Status = "PENDING",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Accepted,
                    SentAt = DateTimeOffset.UtcNow
                }
            })
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.True(response.AllMembersAccepted);
    }

    [Fact]
    public void AllMembersAccepted_WithPendingInvitation_IsFalse()
    {
        var registration = new Registration
        {
            Id = 6,
            GameId = 9,
            DivisionId = 4,
            CaptainEmail = "captain@example.com",
            Status = "PENDING",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Pending,
                    SentAt = DateTimeOffset.UtcNow
                }
            })
        };

        var response = RegistrationResponse.FromEntity(registration);

        Assert.False(response.AllMembersAccepted);
    }

    [Fact]
    public void QueryResponse_PreservesCompleteRegistrationDetails()
    {
        var registration = new Registration
        {
            Id = 3,
            GameId = 9,
            DivisionId = 4,
            TeamName = "Query Team",
            TeamBio = "Query Team Bio",
            CaptainEmail = "captain@example.com",
            FormData = "{\"school\":\"Example University\"}",
            Status = "PENDING",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Accepted,
                    MemberFields = "{\"grade\":3}",
                    SentAt = DateTimeOffset.UtcNow
                }
            })
        };

        var response = RegistrationQueryResponse.FromEntity(registration);

        Assert.Equal("Query Team", response.TeamName);
        Assert.Equal("Query Team Bio", response.TeamBio);
        Assert.Equal("captain@example.com", response.CaptainEmail);
        Assert.Equal(4, response.DivisionId);
        Assert.Equal("{\"school\":\"Example University\"}", response.FormData);
        var member = Assert.Single(response.Members);
        Assert.Equal("{\"grade\":3}", member.MemberFields);
    }
}
