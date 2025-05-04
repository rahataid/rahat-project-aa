#[cfg(test)]
use super::*;
use soroban_sdk::{Env, String, Symbol};

#[test]
fn test_add_get_update_trigger() {
    let env = Env::default();

    let contract_id = env.register_contract(None, Contract);
    let client = ContractClient::new(&env, &contract_id);

    let id = Symbol::new(&env, "trigger1");
    let trigger_type = String::from_str(&env, "manual");
    let phase = String::from_str(&env, "readiness");
    let title = String::from_str(&env, "Test Trigger");
    let source = String::from_str(&env, "glofas");
    let river_basin = String::from_str(&env, "Narayani");
    let params_hash = String::from_str(&env, "hash123");
    let is_mandatory = true;

    // Add the trigger
    client.add_trigger(
        &id,
        &trigger_type,
        &phase,
        &title,
        &source,
        &river_basin,
        &params_hash,
        &is_mandatory,
    );

    // Retrieve and check values
    let trigger = client.get_trigger(&id).expect("Trigger should exist");
    assert_eq!(trigger.title, title);
    assert_eq!(trigger.is_triggered, false);

    // Update trigger status to triggered
    client.update_trigger_to_triggered(&id);

    let updated_trigger = client.get_trigger(&id).expect("Trigger should still exist");
    assert_eq!(updated_trigger.is_triggered, true);
}
