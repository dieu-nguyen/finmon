def test_lookalike_create_and_update_validation(client):
    missing_name = client.post("/api/patterns", json={"name": "  ", "reference": "VCB", "enabled": True})
    assert missing_name.status_code == 400
    missing_ref = client.post("/api/patterns", json={"name": "Rise", "reference": "", "enabled": True})
    assert missing_ref.status_code == 400
    bad_score = client.post("/api/patterns", json={"name": "Rise", "reference": "VCB", "min_score": 1.5, "enabled": True})
    assert bad_score.status_code == 400
    bad_k = client.post("/api/patterns", json={"name": "Rise", "reference": "VCB", "top_k": 0, "enabled": True})
    assert bad_k.status_code == 400
    unknown_kind = client.post("/api/patterns", json={"name": "Rise", "kind": "volume", "reference": "VCB", "enabled": True})
    assert unknown_kind.status_code == 422

    created = client.post(
        "/api/patterns",
        json={"name": "Rise", "reference": "vcb", "min_score": 0.8, "top_k": 10, "enabled": True},
    )
    assert created.status_code == 200
    body = created.json()
    assert body["kind"] == "lookalike"
    assert body["spec"] == {"reference": "VCB", "min_score": 0.8, "top_k": 10}

    listed = client.get("/api/patterns")
    assert [row["id"] for row in listed.json()] == [body["id"]]

    missing = client.put(
        "/api/patterns/999",
        json={"name": "Rise", "reference": "VCB", "min_score": 0.8, "top_k": 10, "enabled": True},
    )
    assert missing.status_code == 404

    updated = client.put(
        f"/api/patterns/{body['id']}",
        json={"name": "Rise 2", "reference": "hpg", "min_score": 0.7, "top_k": 5, "enabled": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Rise 2"
    assert updated.json()["enabled"] is False
    assert updated.json()["spec"]["reference"] == "HPG"
    assert updated.json()["spec"]["min_score"] == 0.7
    assert updated.json()["spec"]["top_k"] == 5
