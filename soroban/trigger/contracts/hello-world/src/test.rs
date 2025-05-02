#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{testutils::{Events as _}, Env, String, Symbol, symbol_short, Vec};

fn create_mock_trigger(env: &Env) -> (String, String, String, String, String, String, bool) {
    (
        String::from_str(env, "manual"),
        String::from_str(env, "readiness"),
        String::from_str(env, "Test Trigger"),
        String::from_str(env, "glofas"),
        String::from_str(env, "Narayani"),
        String::from_str(env, "7b34b13d2a2e1020efdea8bcba7719b288a11f82d83467d6de2227c145c56cdb"), // Mock params_hash
        true,
    )
}

#[test]
fn test_add_and_get_trigger() {
    let env = Env::default();
    let contract = Contract {};

    let (trigger_type, phase, title, source, river_basin, params_hash, is_mandatory) = create_mock_trigger(&env);
    let trigger_id = symbol_short!("trigger1");

    // Call add_trigger
    contract.add_trigger(
        env.clone(),
        trigger_id,
        trigger_type.clone(),
        phase.clone(),
        title.clone(),
        source.clone(),
        river_basin.clone(),
        params_hash.clone(),
        is_mandatory,
    );

    // Verify the trigger was stored
    let retrieved_trigger = contract.get_trigger(env.clone(), trigger_id);
    assert!(retrieved_trigger.is_some());
    let trigger = retrieved_trigger.unwrap();
    assert_eq!(trigger.trigger_type, trigger_type);
    assert_eq!(trigger.phase, phase);
    assert_eq!(trigger.title, title);
    assert_eq!(trigger.source, source);
    assert_eq!(trigger.river_basin, river_basin);
    assert_eq!(trigger.params_hash, params_hash);
    assert_eq!(trigger.is_mandatory, is_mandatory);
    assert_eq!(trigger.is_triggered, false);

    // Verify the Added event
    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let event = events.get(0).unwrap();
    assert_eq!(event.topics, vec![String::from_str(&env, "TriggerEvent"), String::from_str(&env, "Added")]);
    if let TriggerEvent::Added(id, trigger) = event.data {
        assert_eq!(id, trigger_id);
        assert_eq!(trigger.trigger_type, trigger_type);
        assert_eq!(trigger.params_hash, params_hash);
    } else {
        panic!("Expected TriggerEvent::Added");
    }
}

#[test]
fn test_update_trigger_to_triggered() {
    let env = Env::default();
    let contract = Contract {};

    let (trigger_type, phase, title, source, river_basin, params_hash, is_mandatory) = create_mock_trigger(&env);
    let trigger_id = symbol_short!("trigger1");

    // Add a trigger
    contract.add_trigger(
        env.clone(),
        trigger_id,
        trigger_type,
        phase,
        title,
        source,
        river_basin,
        params_hash,
        is_mandatory,
    );

    // Verify initial state
    let initial_trigger = contract.get_trigger(env.clone(), trigger_id).unwrap();
    assert_eq!(initial_trigger.is_triggered, false);

    // Update to triggered
    contract.update_trigger_to_triggered(env.clone(), trigger_id);

    // Verify updated state
    let updated_trigger = contract.get_trigger(env.clone(), trigger_id).unwrap();
    assert_eq!(updated_trigger.is_triggered, true);

    // Verify the Triggered event
    let events = env.events().all();
    assert_eq!(events.len(), 2); // Added + Triggered
    let event = events.get(1).unwrap();
    assert_eq!(event.topics, vec![String::from_str(&env, "TriggerEvent"), String::from_str(&env, "Triggered")]);
    if let TriggerEvent::Triggered(id, trigger) = event.data {
        assert_eq!(id, trigger_id);
        assert_eq!(trigger.is_triggered, true);
    } else {
        panic!("Expected TriggerEvent::Triggered");
    }
}

#[test]
fn test_add_multiple_triggers() {
    let env = Env::default();
    let contract = Contract {};

    for i in 0..5 {
        let trigger_id = symbol_short!(&format!("trigger{}", i));
        let (trigger_type, phase, title, source, river_basin, params_hash, is_mandatory) = create_mock_trigger(&env);
        let unique_title = String::from_str(&env, &format!("Trigger {}", i));

        contract.add_trigger(
            env.clone(),
            trigger_id,
            trigger_type.clone(),
            phase,
            unique_title.clone(),
            source,
            river_basin,
            params_hash,
            is_mandatory,
        );

        let trigger = contract.get_trigger(env.clone(), trigger_id).unwrap();
        assert_eq!(trigger.title, unique_title);
    }

    // Verify all triggers are stored
    let trigger_key = symbol_short!("triggers");
    let triggers: Map<Symbol, Trigger> = env
        .storage()
        .persistent()
        .get(&trigger_key)
        .unwrap_or(Map::new(&env));
    assert_eq!(triggers.len(), 5);
}