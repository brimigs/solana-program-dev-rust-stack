## Key changes

1. Anchor Account Fetching & Deserialization

   ```rust
   // litesvm:
   let account = svm.get_account(&pda).unwrap();
   let mut data = &account.data[8..];  // Skip discriminator
   let state: MyState = AnchorDeserialize::deserialize(&mut data).unwrap();

   // anchor-litesvm:
   let state: MyState = svm.get_anchor_account(&pda).unwrap();
   ```

2. Program Deployment from Anchor Build

   ```rust
   // litesvm:
   let so_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
       .join("target/deploy/my_program.so");
   let program_bytes = std::fs::read(so_path).unwrap();
   svm.add_program(my_program::ID, &program_bytes);

   // anchor-litesvm:
   svm.deploy_anchor_program("my_program").unwrap();
   // Finds and deploys from target/deploy/
   ```

3. Transaction Builder/Helper

   ```rust
   // litesvm
   let recent_blockhash = svm.latest_blockhash();
   let tx = Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&admin.pubkey()),
            &[&admin],
            blockhash,
        );
    svm.send_transaction(tx).unwrap();

   // anchor-litesvm
   svm.send_transaction(&program_id, "initialize", args, &[&payer])?;
   ```

4. IDL based instruction builder

   ```rust
   // litesvm
   fn create_journal_entry_instruction(
        title: String,
        message: String,
        owner: &Pubkey,
    ) -> Instruction {
        let (journal_entry_pda, _) = get_journal_entry_pda(&title, owner);

        Instruction {
            program_id: crud::ID,
            accounts: vec![
                AccountMeta::new(journal_entry_pda, false),
                AccountMeta::new(*owner, true),
                AccountMeta::new_readonly(system_program::ID, false),
            ],
            data: crud::instruction::CreateJournalEntry { title, message }.data(),
        }
    }

    let ix = create_journal_entry_instruction(
        title.clone(),
        message.clone(),
        &admin.pubkey(),
    );

   ```
